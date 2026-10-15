CREATE TYPE "public"."level_section" AS ENUM('nursery', 'primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multi_choice', 'true_false', 'fill_blank', 'essay');--> statement-breakpoint
CREATE TYPE "public"."subject_section" AS ENUM('primary', 'secondary', 'both');--> statement-breakpoint
CREATE TABLE "levels" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"section" "level_section",
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_levels_school_name" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"question_id" text NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"asset_id" text
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"level_id" text,
	"type" "question_type" NOT NULL,
	"stem" text NOT NULL,
	"explanation" text,
	"marks" numeric(5, 2) DEFAULT '1' NOT NULL,
	"difficulty" "question_difficulty",
	"topic" text,
	"tags" text[],
	"fill_answers" jsonb,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"supersedes_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_row_id" text
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"section" "subject_section",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_subjects_school_name" UNIQUE("school_id","name")
);
--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_levels_school_section" ON "levels" USING btree ("school_id","section","sort_order");--> statement-breakpoint
CREATE INDEX "idx_question_options_question" ON "question_options" USING btree ("question_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_question_options_correct" ON "question_options" USING btree ("question_id") WHERE is_correct = true;--> statement-breakpoint
CREATE INDEX "idx_questions_school_subject" ON "questions" USING btree ("school_id","subject_id","status");--> statement-breakpoint
CREATE INDEX "idx_questions_level" ON "questions" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "idx_questions_topic" ON "questions" USING btree ("school_id","topic");--> statement-breakpoint
CREATE INDEX "idx_questions_difficulty" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_questions_creator" ON "questions" USING btree ("created_by","status");--> statement-breakpoint
CREATE INDEX "idx_questions_supersedes" ON "questions" USING btree ("supersedes_id");