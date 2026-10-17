CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'whatsapp', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."remark_run_status" AS ENUM('previewed', 'applied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('draft', 'reviewed', 'released', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('active', 'voided');--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"bands" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"user_id" text,
	"guardian_id" text,
	"student_id" text,
	"result_id" text,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remark_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"exam_id" text NOT NULL,
	"question_id" text NOT NULL,
	"new_question_id" text,
	"reason" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" "remark_run_status" DEFAULT 'previewed' NOT NULL,
	"affected" integer DEFAULT 0 NOT NULL,
	"new_key_version" integer,
	"preview" jsonb,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"submission_id" text NOT NULL,
	"school_id" text NOT NULL,
	"student_id" text NOT NULL,
	"exam_id" text NOT NULL,
	"subject_id" text,
	"class_id" text,
	"score" numeric(7, 2) NOT NULL,
	"max_score" numeric(7, 2) NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"grade" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" "result_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"released_by" text,
	"released_at" timestamp with time zone,
	"withdrawn_reason" text,
	"teacher_comment" text,
	"updated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_results_submission" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "submission_answers" (
	"submission_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" jsonb,
	"flagged" boolean DEFAULT false NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone,
	"cloud_marks" numeric(5, 2),
	"max_marks" numeric(5, 2),
	CONSTRAINT "submission_answers_submission_id_question_id_pk" PRIMARY KEY("submission_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"sitting_id" text NOT NULL,
	"student_id" text NOT NULL,
	"exam_id" text NOT NULL,
	"class_id" text,
	"pack_version" integer NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"seat" text,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"submit_reason" text,
	"status" "submission_status" DEFAULT 'active' NOT NULL,
	"school_score" numeric(7, 2),
	"cloud_score" numeric(7, 2),
	"focus_lost_count" integer DEFAULT 0 NOT NULL,
	"extra_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_submissions_sitting_student" UNIQUE("sitting_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remark_runs" ADD CONSTRAINT "remark_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remark_runs" ADD CONSTRAINT "remark_runs_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remark_runs" ADD CONSTRAINT "remark_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sitting_id_sittings_id_fk" FOREIGN KEY ("sitting_id") REFERENCES "public"."sittings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_grade_scales_school" ON "grade_scales" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "idx_grade_scales_default" ON "grade_scales" USING btree ("school_id","is_default");--> statement-breakpoint
CREATE INDEX "idx_notifications_school_status" ON "notifications" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_guardian_read" ON "notifications" USING btree ("guardian_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_remark_runs_exam_status" ON "remark_runs" USING btree ("exam_id","status");--> statement-breakpoint
CREATE INDEX "idx_results_parent_view" ON "results" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "idx_results_exam_class" ON "results" USING btree ("exam_id","class_id");--> statement-breakpoint
CREATE INDEX "idx_results_school_status" ON "results" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "idx_submission_answers_question" ON "submission_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_school_exam" ON "submissions" USING btree ("school_id","exam_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_student" ON "submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_exam" ON "submissions" USING btree ("exam_id");