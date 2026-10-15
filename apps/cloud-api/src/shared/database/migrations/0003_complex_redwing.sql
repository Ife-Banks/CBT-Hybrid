CREATE TYPE "public"."asset_type" AS ENUM('image', 'audio', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."import_job_kind" AS ENUM('word', 'excel', 'csv', 'json');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'matching';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'ordering';--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"type" "asset_type" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"storage_provider" text DEFAULT 'local' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"kind" "import_job_kind" NOT NULL,
	"status" "import_job_status" DEFAULT 'pending' NOT NULL,
	"file_asset_id" text,
	"uploaded_by" text NOT NULL,
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"succeeded_rows" integer DEFAULT 0,
	"failed_rows" integer DEFAULT 0,
	"error_summary" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_assets" (
	"question_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"asset_role" text DEFAULT 'illustration' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_assets_question_id_asset_id_pk" PRIMARY KEY("question_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "matching_pairs" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "correct_order" jsonb;--> statement-breakpoint
CREATE INDEX "idx_questions_tags_gin" ON "questions" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_file_asset_id_assets_id_fk" FOREIGN KEY ("file_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_school_type" ON "assets" USING btree ("school_id","type");--> statement-breakpoint
CREATE INDEX "idx_assets_uploader" ON "assets" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_school_status" ON "import_jobs" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_uploader" ON "import_jobs" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_created" ON "import_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_question_assets_question" ON "question_assets" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_question_assets_asset" ON "question_assets" USING btree ("asset_id");
