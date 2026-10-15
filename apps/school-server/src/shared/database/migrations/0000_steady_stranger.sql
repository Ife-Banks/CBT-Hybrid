CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text,
	`user_id` text,
	`purpose` text NOT NULL,
	`sent_to` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_otp_challenges_lookup` ON `otp_challenges` (`id`,`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_otp_cleanup` ON `otp_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`logo_asset_id` text,
	`timezone` text DEFAULT 'Africa/Lagos' NOT NULL,
	`grade_scale_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`licence_expires` integer,
	`max_students` integer DEFAULT 1000 NOT NULL,
	`settings` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_code_unique` ON `schools` (`code`);--> statement-breakpoint
CREATE INDEX `idx_schools_status` ON `schools` (`status`);--> statement-breakpoint
CREATE INDEX `idx_schools_expiry` ON `schools` (`licence_expires`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer,
	`ip_address` text,
	`user_agent` text,
	`device_name` text,
	`revoked_at` integer,
	`sliding` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_token` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text,
	`role` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone_e164` text,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`totp_secret` text,
	`recovery_code_hashes` text,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`must_change_password` integer DEFAULT false NOT NULL,
	`preferences` text DEFAULT '{}',
	`password_changed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_users_school_role` ON `users` (`school_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_users_locked` ON `users` (`locked_until`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_school_email` ON `users` (`school_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_school_phone` ON `users` (`school_id`,`phone_e164`);