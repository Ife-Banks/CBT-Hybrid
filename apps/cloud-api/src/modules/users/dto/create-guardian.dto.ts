import { z } from 'zod';

export const CreateGuardianSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email().optional(),
  phoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  relationship: z.string().optional(),
});

export type CreateGuardianDto = z.infer<typeof CreateGuardianSchema>;
