-- Phase 8: bidirectional sync system (CBT-Phase-8-SyncSystem).
--
-- Adds the tables backing conflict detection/resolution, per-sync metrics,
-- resumable checkpoints, retry history and per-entity version vectors.
-- Also (idempotently) creates `session_events`, which an earlier migration
-- declared but never registered in the migration journal.

CREATE TABLE IF NOT EXISTS `session_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_session_events_session` ON `session_events` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_session_events_at` ON `session_events` (`at`);--> statement-breakpoint
INSERT OR IGNORE INTO `meta` (`key`, `value`) VALUES ('console_pin_hash', '');--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text DEFAULT 'local' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`local_version` integer DEFAULT 0 NOT NULL,
	`remote_version` integer DEFAULT 0 NOT NULL,
	`local_updated_at` text,
	`remote_updated_at` text,
	`local_json` text NOT NULL,
	`remote_json` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_json` text,
	`detected_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	CONSTRAINT "sync_conflicts_status_check" CHECK("sync_conflicts"."status" IN ('open','resolved','ignored'))
);--> statement-breakpoint
CREATE INDEX `idx_sync_conflicts_status` ON `sync_conflicts` (`status`,`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_conflicts_entity` ON `sync_conflicts` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_conflicts_school` ON `sync_conflicts` (`school_id`,`status`);--> statement-breakpoint
CREATE TABLE `sync_metrics` (
	`sync_id` text PRIMARY KEY NOT NULL,
	`school_id` text DEFAULT 'local' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	`pushed` integer DEFAULT 0 NOT NULL,
	`pulled_roster` integer DEFAULT 0 NOT NULL,
	`pulled_packs` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`conflicts_detected` integer DEFAULT 0 NOT NULL,
	`conflicts_resolved` integer DEFAULT 0 NOT NULL,
	`bytes_transferred` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	CONSTRAINT "sync_metrics_status_check" CHECK("sync_metrics"."status" IN ('running','success','partial','failed'))
);--> statement-breakpoint
CREATE INDEX `idx_sync_metrics_started` ON `sync_metrics` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_metrics_school` ON `sync_metrics` (`school_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `sync_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL,
	`school_id` text DEFAULT 'local' NOT NULL,
	`phase` text NOT NULL,
	`cursor` text,
	`processed` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "sync_checkpoints_status_check" CHECK("sync_checkpoints"."status" IN ('pending','in_progress','completed','failed'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_checkpoints_sync_phase` ON `sync_checkpoints` (`sync_id`,`phase`);--> statement-breakpoint
CREATE INDEX `idx_sync_checkpoints_school` ON `sync_checkpoints` (`school_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `sync_retry_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`school_id` text DEFAULT 'local' NOT NULL,
	`attempt` integer NOT NULL,
	`error_msg` text NOT NULL,
	`attempted_at` text NOT NULL,
	`next_attempt_at` text
);--> statement-breakpoint
CREATE INDEX `idx_sync_retry_event` ON `sync_retry_history` (`event_id`,`attempt`);--> statement-breakpoint
CREATE INDEX `idx_sync_retry_school` ON `sync_retry_history` (`school_id`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `sync_entity_versions` (
	`school_id` text DEFAULT 'local' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`local_version` integer DEFAULT 0 NOT NULL,
	`remote_version` integer DEFAULT 0 NOT NULL,
	`base_version` integer DEFAULT 0 NOT NULL,
	`base_json` text,
	`local_updated_at` text,
	`remote_updated_at` text,
	`last_synced_at` text,
	PRIMARY KEY(`school_id`, `entity_type`, `entity_id`)
);--> statement-breakpoint
CREATE INDEX `idx_sync_entity_versions_entity` ON `sync_entity_versions` (`entity_type`,`entity_id`);
