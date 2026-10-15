import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  section: z.enum(['primary', 'secondary', 'both']).optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).optional(),
  section: z.enum(['primary', 'secondary', 'both']).optional(),
});

export const createLevelSchema = z.object({
  name: z.string().min(1).max(50),
  section: z.enum(['nursery', 'primary', 'secondary']).optional(),
  sortOrder: z.number().int().min(0),
});

export const updateLevelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  section: z.enum(['nursery', 'primary', 'secondary']).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createQuestionSchema = z.object({
  subjectId: z.string().uuid(),
  levelId: z.string().uuid().optional(),
  type: z.enum(['single_choice', 'multi_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering']),
  stem: z.string().min(1).max(5000),
  explanation: z.string().max(5000).optional(),
  marks: z.number().positive().max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  fillAnswers: z.record(z.string(), z.unknown()).optional(),
  matchingPairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
  correctOrder: z.array(z.string()).optional(),
});

export const updateQuestionSchema = z.object({
  subjectId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
  stem: z.string().min(1).max(5000).optional(),
  explanation: z.string().max(5000).optional(),
  marks: z.number().positive().max(100).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  fillAnswers: z.record(z.string(), z.unknown()).optional(),
  matchingPairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
  correctOrder: z.array(z.string()).optional(),
  status: z.enum(['draft', 'approved', 'retired']).optional(),
});

export const questionFilterSchema = z.object({
  subjectId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
  type: z.enum(['single_choice', 'multi_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'approved', 'retired']).optional(),
  createdBy: z.string().uuid().optional(),
  search: z.string().max(500).optional(),
});

export const questionSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'marks', 'usageCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filter: questionFilterSchema.optional(),
});

// Phase 5B: Asset DTOs
export const createAssetSchema = z.object({
  type: z.enum(['image', 'audio', 'video', 'document']),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().min(1).max(500),
  storageProvider: z.string().max(50).optional(),
});

export const createQuestionAssetSchema = z.object({
  questionId: z.string().uuid(),
  assetId: z.string().uuid(),
  assetRole: z.string().max(50).optional(),
});

// Phase 5B: Import Job DTOs
export const createImportJobSchema = z.object({
  kind: z.enum(['word', 'excel', 'csv', 'json']),
  fileAssetId: z.string().uuid(),
});

export const updateImportJobSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  totalRows: z.number().int().min(0).optional(),
  processedRows: z.number().int().min(0).optional(),
  succeededRows: z.number().int().min(0).optional(),
  failedRows: z.number().int().min(0).optional(),
  errorSummary: z.record(z.string(), z.unknown()).optional(),
});
