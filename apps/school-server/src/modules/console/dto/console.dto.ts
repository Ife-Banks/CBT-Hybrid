import { z } from 'zod';
import { problem } from '../../../common/http/problem';
import { zodOrThrow } from './dto.utils';

const loginSchema = z.object({
  pin: z.string().length(6).regex(/^\d+$/),
  label: z.string().optional(),
});

const pinChangeSchema = z.object({
  old_pin: z.string().length(6).regex(/^\d+$/),
  new_pin: z.string().length(6).regex(/^\d+$/),
});

const pinResetSchema = z.object({
  reset_code: z.string().min(1),
  new_pin: z.string().length(6).regex(/^\d+$/),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type PinChangeDto = z.infer<typeof pinChangeSchema>;
export type PinResetDto = z.infer<typeof pinResetSchema>;

export const parseLogin = (value: unknown): LoginDto => zodOrThrow(loginSchema, value);
export const parsePinChange = (value: unknown): PinChangeDto => zodOrThrow(pinChangeSchema, value);
export const parsePinReset = (value: unknown): PinResetDto => zodOrThrow(pinResetSchema, value);
