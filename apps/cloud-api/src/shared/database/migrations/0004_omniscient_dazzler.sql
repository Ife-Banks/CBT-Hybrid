CREATE TYPE "public"."exam_kind" AS ENUM('test', 'exam', 'practice', 'quiz');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('draft', 'ready', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sitting_status" AS ENUM('scheduled', 'open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"level_name" text,
	"section" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_classes" (
	"exam_id" text NOT NULL,
	"class_id" text NOT NULL,
	CONSTRAINT "exam_classes_exam_id_class_id_pk" PRIMARY KEY("exam_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "exam_packs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"exam_id" text NOT NULL,
	"version" integer NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"manifest" jsonb NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_exam_packs_exam_version" UNIQUE("exam_id","version")
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"exam_id" text NOT NULL,
	"question_id" text NOT NULL,
	"position" integer NOT NULL,
	"marks_override" numeric(5, 2),
	CONSTRAINT "exam_questions_exam_id_question_id_pk" PRIMARY KEY("exam_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"title" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" "exam_kind" DEFAULT 'exam' NOT NULL,
	"duration_min" integer NOT NULL,
	"shuffle_questions" boolean DEFAULT true NOT NULL,
	"shuffle_options" boolean DEFAULT true NOT NULL,
	"negative_marking" boolean DEFAULT false NOT NULL,
	"show_score_to_student" boolean DEFAULT false NOT NULL,
	"pass_mark_pct" numeric(5, 2),
	"instructions" text,
	"status" "exam_status" DEFAULT 'draft' NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sittings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"exam_id" text NOT NULL,
	"class_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"extra_time_min" integer DEFAULT 0 NOT NULL,
	"status" "sitting_status" DEFAULT 'scheduled' NOT NULL,
	"exam_key_hash" text,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_classes" ADD CONSTRAINT "exam_classes_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_classes" ADD CONSTRAINT "exam_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_packs" ADD CONSTRAINT "exam_packs_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sittings" ADD CONSTRAINT "sittings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sittings" ADD CONSTRAINT "sittings_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sittings" ADD CONSTRAINT "sittings_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sittings" ADD CONSTRAINT "sittings_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_classes_school_section" ON "classes" USING btree ("school_id","section");--> statement-breakpoint
CREATE INDEX "idx_exam_classes_class" ON "exam_classes" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_exam_packs_exam" ON "exam_packs" USING btree ("exam_id","version");--> statement-breakpoint
CREATE INDEX "idx_exam_packs_sha256" ON "exam_packs" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "idx_exam_questions_question" ON "exam_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_exam_questions_position" ON "exam_questions" USING btree ("exam_id","position");--> statement-breakpoint
CREATE INDEX "idx_exams_school_status" ON "exams" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_exams_subject" ON "exams" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_exams_creator" ON "exams" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_exams_frozen" ON "exams" USING btree ("frozen_at");--> statement-breakpoint
CREATE INDEX "idx_sittings_school_status" ON "sittings" USING btree ("school_id","status","window_start");--> statement-breakpoint
CREATE INDEX "idx_sittings_exam" ON "sittings" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_sittings_class" ON "sittings" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_sittings_window" ON "sittings" USING btree ("window_start","window_end");