-- Add session_events table for client integrity signals (Section 16.10).
-- Records focus_lost and focus_regained events for teacher visibility.
-- Also add console_pin_hash to meta for Section 17 invigilator console PIN sign-in.

CREATE TABLE IF NOT EXISTS `session_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_session_events_session` ON `session_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_session_events_at` ON `session_events` (`at`);--> statement-breakpoint
INSERT OR IGNORE INTO `meta` (`key`, `value`) VALUES ('console_pin_hash', '');
