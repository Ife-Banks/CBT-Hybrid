-- Phase 6C: school-server exam delivery schema (CBT-Database-Architecture 4.2).
--
-- The staff/parent sign-in table is renamed so the exam-session table can take
-- the name the specification gives it.

ALTER TABLE `sessions` RENAME TO `auth_sessions`;--> statement-breakpoint
DROP INDEX `idx_sessions_user`;--> statement-breakpoint
DROP INDEX `idx_sessions_expires`;--> statement-breakpoint
DROP INDEX `idx_sessions_token`;--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user` ON `auth_sessions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_expires` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_token` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`level_name` text,
	`section` text NOT NULL,
	CONSTRAINT "classes_section_check" CHECK("classes"."section" IN ('nursery','primary','secondary'))
);
--> statement-breakpoint
CREATE INDEX `idx_classes_section` ON `classes` (`section`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subject_id` text,
	`duration_min` integer NOT NULL,
	`settings_json` text NOT NULL,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`code_status` text NOT NULL,
	`full_name` text NOT NULL,
	`class_id` text,
	`section` text NOT NULL,
	`photo_path` text,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "students_code_status_check" CHECK("students"."code_status" IN ('active','revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_code_unique` ON `students` (`code`);--> statement-breakpoint
CREATE INDEX `idx_students_code` ON `students` (`code`);--> statement-breakpoint
CREATE INDEX `idx_students_class` ON `students` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_students_name` ON `students` (`full_name`);--> statement-breakpoint
CREATE TABLE `packs` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`version` integer NOT NULL,
	`key_version` integer NOT NULL,
	`dir_path` text NOT NULL,
	`sha256` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`question_count` integer,
	`total_marks` real,
	`downloaded_at` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_packs_exam` ON `packs` (`exam_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_packs_unverified` ON `packs` (`verified`) WHERE "packs"."verified" = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_packs_exam_version` ON `packs` (`exam_id`,`version`);--> statement-breakpoint
CREATE TABLE `sittings` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`class_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`extra_time_min` integer DEFAULT 0 NOT NULL,
	`exam_key_hash` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`opened_at` text,
	`closed_at` text,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sittings_status_check" CHECK("sittings"."status" IN ('scheduled','open','closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_sittings_status` ON `sittings` (`status`,`window_start`);--> statement-breakpoint
CREATE INDEX `idx_sittings_exam` ON `sittings` (`exam_id`);--> statement-breakpoint
CREATE INDEX `idx_sittings_class` ON `sittings` (`class_id`);--> statement-breakpoint
CREATE TABLE `seats` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text,
	`last_seen_at` text,
	`last_ip` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sitting_id` text NOT NULL,
	`student_id` text NOT NULL,
	`seat` text,
	`token_hash` text NOT NULL,
	`seed` integer NOT NULL,
	`started_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`submitted_at` text,
	`submit_reason` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`focus_lost_count` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text,
	`last_ip` text,
	FOREIGN KEY (`sitting_id`) REFERENCES `sittings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_status_check" CHECK("sessions"."status" IN ('in_progress','submitted','expired','reset'))
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_sitting` ON `sessions` (`sitting_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sessions_student` ON `sessions` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_token` ON `sessions` (`token_hash`) WHERE "sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX `idx_sessions_seat` ON `sessions` (`seat`) WHERE "sessions"."seat" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_sitting_student` ON `sessions` (`sitting_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `answers` (
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_json` text NOT NULL,
	`seq` integer NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `question_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_answers_session` ON `answers` (`session_id`);--> statement-breakpoint
CREATE TRIGGER `prevent_answer_rollback`
BEFORE UPDATE ON `answers`
FOR EACH ROW
WHEN NEW.`seq` <= OLD.`seq`
BEGIN
	SELECT RAISE(IGNORE);
END;--> statement-breakpoint
CREATE TABLE `results` (
	`session_id` text PRIMARY KEY NOT NULL,
	`score` real NOT NULL,
	`max_score` real NOT NULL,
	`percent` real NOT NULL,
	`grade` text,
	`scored_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`event_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`acked_at` text,
	`error_msg` text
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_pending` ON `outbox` (`next_attempt_at`,`attempts`) WHERE "outbox"."acked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_outbox_type` ON `outbox` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `backup_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`path` text NOT NULL,
	`bytes` integer,
	`sha256` text,
	`ok` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backup_log_at` ON `backup_log` (`at`);
