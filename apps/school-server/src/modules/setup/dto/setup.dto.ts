import { z } from 'zod';
import { zodOrThrow } from '../../../common/validation/zod';

/** Console PIN: six digits, matching the console API (API spec 17.1). */
const pin = z.string().length(6).regex(/^\d+$/);

const consolePinSchema = z.object({ pin });

const schoolNameSchema = z.object({ name: z.string().trim().min(1).max(200) });

const backupPathSchema = z.object({ path: z.string().trim().min(1).max(1000) });

const activateSchema = z.object({
  /** One-time code from the cloud (API spec 12.2). */
  activation_code: z.string().trim().min(1).max(64),
  /** Shown on the cloud device list; defaults to the machine hostname. */
  device_name: z.string().trim().min(1).max(100).optional(),
  /** Overrides the configured cloud URL for this activation only. */
  cloud_url: z.string().url().optional(),
});

export type ConsolePinDto = z.infer<typeof consolePinSchema>;
export type SchoolNameDto = z.infer<typeof schoolNameSchema>;
export type BackupPathDto = z.infer<typeof backupPathSchema>;
export type ActivateDto = z.infer<typeof activateSchema>;

export const parseConsolePin = (value: unknown): ConsolePinDto =>
  zodOrThrow(consolePinSchema, value);
export const parseSchoolName = (value: unknown): SchoolNameDto =>
  zodOrThrow(schoolNameSchema, value);
export const parseBackupPath = (value: unknown): BackupPathDto =>
  zodOrThrow(backupPathSchema, value);
export const parseActivate = (value: unknown): ActivateDto => zodOrThrow(activateSchema, value);
