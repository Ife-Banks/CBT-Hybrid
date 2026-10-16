import { z } from 'zod';

// Class DTOs
export const createClassSchema = z.object({
  name: z.string().min(1).max(100),
  levelName: z.string().optional(),
  section: z.enum(['nursery', 'primary', 'secondary']),
});

export type CreateClassDto = z.infer<typeof createClassSchema>;

// Exam DTOs
export const createExamSchema = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().uuid(),
  kind: z.enum(['test', 'exam', 'practice', 'quiz']).optional(),
  durationMin: z.number().int().positive().max(300),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  negativeMarking: z.boolean().optional(),
  showScoreToStudent: z.boolean().optional(),
  passMarkPct: z.number().min(0).max(100).optional(),
  instructions: z.string().optional(),
});

export type CreateExamDto = z.infer<typeof createExamSchema>;

export const updateExamSchema = createExamSchema.partial();

export type UpdateExamDto = z.infer<typeof updateExamSchema>;

// Sitting DTOs
export const createSittingSchema = z.object({
  examId: z.string().uuid(),
  classId: z.string().uuid(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  extraTimeMin: z.number().int().min(0).optional(),
});

export type CreateSittingDto = z.infer<typeof createSittingSchema>;

export const updateSittingSchema = createSittingSchema.partial().extend({
  status: z.enum(['scheduled', 'open', 'closed', 'cancelled']).optional(),
});

export type UpdateSittingDto = z.infer<typeof updateSittingSchema>;

// Question selection DTO
export const questionSelectionSchema = z.object({
  method: z.enum(['individual', 'filter', 'random', 'import']),
  questionIds: z.array(z.string().uuid()).optional(),
  filter: z.object({
    subjectId: z.string().uuid().optional(),
    levelId: z.string().uuid().optional(),
    type: z.array(z.string()).optional(),
    difficulty: z.array(z.string()).optional(),
    topic: z.string().optional(),
    tags: z.array(z.string()).optional(),
    count: z.number().int().positive().optional(),
  }).optional(),
});

export type QuestionSelection = z.infer<typeof questionSelectionSchema>;

// Pack DTOs (Phase 6B)
export const validatePackSchema = z
  .object({
    packId: z.string().min(1).optional(),
    packBase64: z.string().min(1).optional(),
    packKeyBase64: z.string().min(1).optional(),
  })
  .refine((value) => value.packId !== undefined || value.packBase64 !== undefined, {
    message: 'Provide packId or packBase64',
  });

export type ValidatePackDto = z.infer<typeof validatePackSchema>;
