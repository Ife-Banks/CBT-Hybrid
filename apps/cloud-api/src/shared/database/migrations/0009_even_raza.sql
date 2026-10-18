CREATE TYPE "public"."import_row_status" AS ENUM('ok', 'warning', 'error', 'skipped', 'imported');--> statement-breakpoint
ALTER TYPE "public"."import_job_kind" ADD VALUE 'questions_docx';--> statement-breakpoint
ALTER TYPE "public"."import_job_kind" ADD VALUE 'questions_xlsx';--> statement-breakpoint
ALTER TYPE "public"."import_job_kind" ADD VALUE 'students';--> statement-breakpoint
ALTER TYPE "public"."import_job_kind" ADD VALUE 'guardians';--> statement-breakpoint
ALTER TYPE "public"."import_job_kind" ADD VALUE 'teachers';--> statement-breakpoint
ALTER TYPE "public"."import_job_status" ADD VALUE 'queued';--> statement-breakpoint
ALTER TYPE "public"."import_job_status" ADD VALUE 'parsing';--> statement-breakpoint
ALTER TYPE "public"."import_job_status" ADD VALUE 'parsed';--> statement-breakpoint
CREATE TABLE "import_job_rows" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"job_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"status" "import_row_status" DEFAULT 'ok' NOT NULL,
	"raw" jsonb,
	"parsed" jsonb,
	"errors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "source_file" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "level_id" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_import_job_rows_job_row" ON "import_job_rows" USING btree ("job_id","row_no");--> statement-breakpoint
CREATE INDEX "idx_import_job_rows_job_status" ON "import_job_rows" USING btree ("job_id","status");