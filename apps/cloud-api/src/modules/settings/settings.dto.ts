import { z } from 'zod';

export const schoolSettingsPatchSchema = z.object({
  release_policy: z.enum(['admin_only', 'class_teacher']).optional(),
  require_question_approval: z.boolean().optional(),
  notify_on_remark: z.boolean().optional(),
  paid_channels_enabled: z
    .object({
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    })
    .optional(),
  paid_message_monthly_cap: z.number().int().nonnegative().optional(),
  strict_seats: z.boolean().optional(),
  retention: z
    .object({
      results_years_after_leaving: z.number().int().nonnegative().optional(),
      sessions_months: z.number().int().nonnegative().optional(),
    })
    .optional(),
  invite_expiry_days: z
    .object({
      staff: z.number().int().nonnegative().optional(),
      guardian: z.number().int().nonnegative().optional(),
    })
    .optional(),
  exam_key_digits: z.number().int().nonnegative().optional(),
});

export type SchoolSettingsPatchDto = z.infer<typeof schoolSettingsPatchSchema>;
