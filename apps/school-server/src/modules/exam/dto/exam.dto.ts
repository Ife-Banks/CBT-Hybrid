import { z, type ZodType } from 'zod';
import { problem } from '../../../common/http/problem';

/** Answer shapes accepted by the exam client (API spec 16.6). */
const answerValueSchema = z
  .union([
    z.object({ option_id: z.string() }),
    z.object({ option_ids: z.array(z.string()) }),
    z.object({ text: z.string() }),
    z.object({ order: z.array(z.string()) }),
    z.object({ pairs: z.array(z.object({ left: z.string(), right: z.string() })) }),
  ])
  .nullable();

const answerChangeSchema = z.object({
  question_id: z.string().min(1),
  answer: answerValueSchema,
  flagged: z.boolean().default(false),
});

const loginSchema = z.object({
  student_code: z.string().min(1),
  exam_key: z.string().min(1),
  seat: z.string().min(1).nullish(),
});

const answersSchema = z.object({
  seq: z.number().int().nonnegative(),
  changes: z.array(answerChangeSchema).default([]),
});

const submitSchema = z.object({
  seq: z.number().int().nonnegative().optional(),
  changes: z.array(answerChangeSchema).default([]),
});

const eventSchema = z.object({
  type: z.enum(['focus_lost', 'focus_regained']),
  at: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type AnswersDto = z.infer<typeof answersSchema>;
export type SubmitDto = z.infer<typeof submitSchema>;
export type EventDto = z.infer<typeof eventSchema>;

/** Validate a body or throw a `VALIDATION_FAILED` problem (API spec 1.4). */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw problem('VALIDATION_FAILED', detail);
}

export const parseLogin = (value: unknown): LoginDto => parseOrThrow(loginSchema, value ?? {});
export const parseAnswers = (value: unknown): AnswersDto => parseOrThrow(answersSchema, value ?? {});
export const parseSubmit = (value: unknown): SubmitDto => parseOrThrow(submitSchema, value ?? {});
export const parseEvent = (value: unknown): EventDto => parseOrThrow(eventSchema, value ?? {});
