import { z } from 'zod';

export const resultStatusSchema = z.enum(['draft', 'reviewed', 'released', 'withdrawn']);

export const resultListQuerySchema = z.object({
  exam_id: z.string().optional(),
  class_id: z.string().optional(),
  status: resultStatusSchema.optional(),
  student_id: z.string().optional(),
  cursor: z.string().optional(),
});

export const reviewResultsSchema = z.object({
  result_ids: z.array(z.string()).optional(),
  exam_id: z.string().optional(),
  class_id: z.string().optional(),
});

export const releaseResultsSchema = z.object({
  result_ids: z.array(z.string()).optional(),
  exam_id: z.string().optional(),
  class_id: z.string().optional(),
  notify: z.boolean().optional(),
});

export const withdrawResultsSchema = z.object({
  result_ids: z.array(z.string()).min(1),
  reason: z.string().optional(),
});

export const keyCorrectionSchema = z.object({
  question_id: z.string().min(1),
  correct_option_ids: z.array(z.string()).optional(),
  fill_answers: z.array(z.string()).optional(),
  case_sensitive: z.boolean().optional(),
  reason: z.string().min(1),
});

export const gradeBandSchema = z.object({
  min: z.number(),
  max: z.number(),
  grade: z.string().min(1),
  remark: z.string().optional(),
});

export const gradeScaleSchema = z.object({
  name: z.string().optional(),
  bands: z.array(gradeBandSchema).min(1),
});

export type ReviewResultsDto = z.infer<typeof reviewResultsSchema>;
export type ReleaseResultsDto = z.infer<typeof releaseResultsSchema>;
export type WithdrawResultsDto = z.infer<typeof withdrawResultsSchema>;
export type KeyCorrectionDto = z.infer<typeof keyCorrectionSchema>;
export type GradeScaleDto = z.infer<typeof gradeScaleSchema>;
