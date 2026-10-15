CREATE TABLE "guardians" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"user_id" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone_e164" text,
	"relationship" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "idx_guardians_school_phone" UNIQUE("school_id","phone_e164")
);
--> statement-breakpoint
CREATE TABLE "guardianships" (
	"guardian_id" text NOT NULL,
	"student_id" text NOT NULL,
	"relationship" text,
	"can_view_results" boolean DEFAULT true NOT NULL,
	"can_pay_fees" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardianships_guardian_id_student_id_pk" PRIMARY KEY("guardian_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"kind" "invitation_kind" NOT NULL,
	"user_id" text,
	"guardian_id" text,
	"token_hash" text NOT NULL,
	"channel" "invitation_channel" NOT NULL,
	"sent_to" text,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "student_codes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"student_id" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"reason" text,
	"issued_by" text,
	CONSTRAINT "student_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text NOT NULL,
	"admission_no" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"other_names" text,
	"gender" text,
	"date_of_birth" timestamp with time zone,
	"photo_asset_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_students_school_admission" UNIQUE("school_id","admission_no")
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"staff_no" text,
	"title" text,
	"department" text,
	"qualifications" text,
	"joined_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_codes" ADD CONSTRAINT "student_codes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_codes" ADD CONSTRAINT "student_codes_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guardians_user" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_guardianships_student" ON "guardianships" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_guardianships_guardian_active" ON "guardianships" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_school_status" ON "invitations" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_invitations_token" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_invitations_expires" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_invitations_guardian" ON "invitations" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "idx_student_codes_student" ON "student_codes" USING btree ("student_id","issued_at");--> statement-breakpoint
CREATE INDEX "idx_students_school_status" ON "students" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "idx_teacher_profiles_staff_no" ON "teacher_profiles" USING btree ("staff_no");