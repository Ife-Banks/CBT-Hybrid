ALTER TYPE "public"."otp_purpose" ADD VALUE 'guardian_email';--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;