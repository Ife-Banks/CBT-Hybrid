import { z } from 'zod';

export const CreateInvitationSchema = z.object({
  kind: z.enum(['staff', 'guardian', 'password_reset']),
  channel: z.enum(['email', 'sms', 'whatsapp', 'printed', 'manual_link']),
  sentTo: z.string().min(1, 'Recipient is required'),
  guardianId: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

export type CreateInvitationDto = z.infer<typeof CreateInvitationSchema>;
