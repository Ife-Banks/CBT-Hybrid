import { z } from 'zod';
import { zodOrThrow } from '../../../common/validation/zod';

const restoreSchema = z.object({
  /** Backup file name inside a backup folder, or an absolute path to one. */
  backup: z.string().min(1),
});

export type RestoreDto = z.infer<typeof restoreSchema>;

export const parseRestore = (value: unknown): RestoreDto => zodOrThrow(restoreSchema, value);
