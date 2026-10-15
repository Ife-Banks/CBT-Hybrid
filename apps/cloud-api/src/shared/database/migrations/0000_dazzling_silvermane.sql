CREATE TYPE "public"."invitation_channel" AS ENUM('email', 'sms', 'whatsapp', 'printed', 'manual_link');--> statement-breakpoint
CREATE TYPE "public"."invitation_kind" AS ENUM('staff', 'guardian', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'sent', 'used', 'expired', 'revoked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('password_reset');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('platform_owner', 'school_admin', 'teacher', 'invigilator', 'parent', 'student');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"invitation_id" text,
	"user_id" text,
	"purpose" "otp_purpose" NOT NULL,
	"sent_to" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"logo_asset_id" text,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"grade_scale_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"licence_expires" timestamp with time zone,
	"max_students" integer DEFAULT 1000,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"device_name" text,
	"revoked_at" timestamp with time zone,
	"sliding" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"school_id" text,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone_e164" text,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"totp_secret" text,
	"recovery_code_hashes" jsonb,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_users_school_email" UNIQUE("school_id","email"),
	CONSTRAINT "idx_users_school_phone" UNIQUE("school_id","phone_e164")
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_otp_challenges_lookup" ON "otp_challenges" USING btree ("id","code_hash");--> statement-breakpoint
CREATE INDEX "idx_otp_cleanup" ON "otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_schools_status" ON "schools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_schools_expiry" ON "schools" USING btree ("licence_expires");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_token" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_users_school_role" ON "users" USING btree ("school_id","role");--> statement-breakpoint
CREATE INDEX "idx_users_locked" ON "users" USING btree ("locked_until");