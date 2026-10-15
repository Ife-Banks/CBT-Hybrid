import { z } from 'zod';

/** The four question types (API and Sync Specification section 14.5). */
export const QuestionTypeSchema = z.enum([
  'single_choice',
  'multiple_choice',
  'fill_blank',
  'essay',
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** A selectable option, as stored on a question. */
export const OptionSchema = z.object({
  id: z.string(),
  body: z.string(),
  /** Present only in teacher-facing payloads that expose the key. */
  is_correct: z.boolean().optional(),
});

export type Option = z.infer<typeof OptionSchema>;

/** The answer a student gave, per question type. */
export const AnswerValueSchema = z.union([
  z.object({ option_id: z.string() }),
  z.object({ option_ids: z.array(z.string()) }),
  z.object({ text: z.string() }),
]);

export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** Marking key. Multiple choice is all-or-nothing (CBT-04 section 4.6). */
export const MarkingKeySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single_choice'),
    marks: z.number().int().nonnegative(),
    correct_option_ids: z.array(z.string()),
  }),
  z.object({
    type: z.literal('multiple_choice'),
    marks: z.number().int().nonnegative(),
    correct_option_ids: z.array(z.string()),
  }),
  z.object({
    type: z.literal('fill_blank'),
    marks: z.number().int().nonnegative(),
    accepted_answers: z.array(z.string()),
    case_sensitive: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('essay'),
    marks: z.number().int().nonnegative(),
  }),
]);

export type MarkingKey = z.infer<typeof MarkingKeySchema>;

/** Lifecycle of an exam sitting, as seen by the school server. */
export const SittingStatusSchema = z.enum(['draft', 'scheduled', 'open', 'closed', 'submitted']);

export type SittingStatus = z.infer<typeof SittingStatusSchema>;
