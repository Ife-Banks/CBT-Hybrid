import { z } from 'zod';

const preferencesSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

export const updateParentProfileSchema = z.object({
  notification_prefs: preferencesSchema.optional(),
});

export const parentEmailOtpSchema = z.object({
  email: z.string().email(),
});

export const parentEmailVerifySchema = z.object({
  challenge_id: z.string().min(1),
  code: z.string().min(4).max(10),
  email: z.string().email(),
});
