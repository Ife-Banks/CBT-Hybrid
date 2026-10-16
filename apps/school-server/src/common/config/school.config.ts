import { z } from 'zod';

/** Empty-string-tolerant optional port, for `.env` files with blank values. */
const optionalPort = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
);

/** Empty-string-tolerant optional secret; blank values count as unset. */
const optionalSecret = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().min(16).optional(),
);

/**
 * School-server configuration. Mostly environment-driven, with a local data
 * directory that holds the SQLite database and the exam-pack folders
 * (CBT-04 section 11.2).
 */
export const SchoolEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  /** Canonical port. */
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  /** Optional local override so both servers can run from one `.env`. */
  SCHOOL_SERVER_PORT: optionalPort,
  CBT_DATA_DIR: z.string().min(1).default('./data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BODY_LIMIT: z.string().default('10mb'),
  /**
   * HMAC secret for the short-lived login ticket (API spec 16.1). Optional so
   * development works out of the box; production must set it.
   */
  TICKET_SIGNING_SECRET: optionalSecret,
});

export type SchoolEnv = z.infer<typeof SchoolEnvSchema>;

/** The four exam-pack folders (Phase 1 task 2). */
export const EXAM_PACK_FOLDERS = ['pending', 'active', 'completed', 'archive'] as const;

/** Validate a school-server environment source. Throws on invalid values. */
export function loadSchoolEnv(source: NodeJS.ProcessEnv = process.env): SchoolEnv {
  const parsed = SchoolEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid school-server configuration: ${issues}`);
  }
  return parsed.data;
}
