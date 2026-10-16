import type { Exam, ExamClass, ExamQuestion, Sitting, ExamPack, Class } from '@cbt/shared-types';

// Domain types for exam management

export interface ExamDomainRecord {
  id: string;
  schoolId: string;
  title: string;
  subjectId: string;
  kind: 'test' | 'exam' | 'practice' | 'quiz';
  durationMin: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  showScoreToStudent: boolean;
  passMarkPct?: number;
  instructions?: string;
  status: 'draft' | 'ready' | 'published' | 'archived';
  frozenAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExamDto {
  title: string;
  subjectId: string;
  kind?: 'test' | 'exam' | 'practice' | 'quiz';
  durationMin: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  negativeMarking?: boolean;
  showScoreToStudent?: boolean;
  passMarkPct?: number;
  instructions?: string;
}

export interface UpdateExamDto {
  title?: string;
  subjectId?: string;
  kind?: 'test' | 'exam' | 'practice' | 'quiz';
  durationMin?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  negativeMarking?: boolean;
  showScoreToStudent?: boolean;
  passMarkPct?: number;
  instructions?: string;
  status?: 'draft' | 'ready' | 'published' | 'archived';
}

export interface ClassDomainRecord {
  id: string;
  schoolId: string;
  name: string;
  levelName?: string;
  section: string;
  createdAt: Date;
}

export interface CreateClassDto {
  name: string;
  levelName?: string;
  section: 'nursery' | 'primary' | 'secondary';
}

export interface ExamClassDomainRecord {
  examId: string;
  classId: string;
}

export interface ExamQuestionDomainRecord {
  examId: string;
  questionId: string;
  position: number;
  marksOverride?: number;
}

export interface CreateExamQuestionDto {
  questionId: string;
  position: number;
  marksOverride?: number;
}

export interface SittingDomainRecord {
  id: string;
  schoolId: string;
  examId: string;
  classId: string;
  windowStart: Date;
  windowEnd: Date;
  extraTimeMin: number;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  examKeyHash?: string;
  openedAt?: Date;
  closedAt?: Date;
  closedBy?: string;
  createdAt: Date;
}

export interface CreateSittingDto {
  examId: string;
  classId: string;
  windowStart: Date;
  windowEnd: Date;
  extraTimeMin?: number;
}

export interface UpdateSittingDto {
  windowStart?: Date;
  windowEnd?: Date;
  extraTimeMin?: number;
  status?: 'scheduled' | 'open' | 'closed' | 'cancelled';
}

export interface ExamPackDomainRecord {
  id: string;
  examId: string;
  version: number;
  keyVersion: number;
  manifest: Record<string, unknown>;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  signature: string;
  createdAt: Date;
}

export interface CreateExamPackDto {
  examId: string;
  version: number;
  keyVersion?: number;
  manifest: Record<string, unknown>;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  signature: string;
}

export interface GeneratePackDto {
  sittingId: string;
  keyVersion?: number;
}

// Phase 6B: pack source data gathered straight from the question bank
export interface PackSourceQuestionOption {
  id: string;
  label: string;
  body: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface PackSourceQuestion {
  questionId: string;
  version: number;
  position: number;
  marksOverride?: number;
  type: 'single_choice' | 'multi_choice' | 'true_false' | 'fill_blank' | 'essay' | 'matching' | 'ordering';
  stem: string;
  marks: number;
  options: PackSourceQuestionOption[];
  assetIds: string[];
  fillAnswers?: Record<string, unknown>;
  correctOrder?: string[];
  matchingPairs?: Array<{ left: string; right: string }>;
}

export interface PackSourceAsset {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}

export interface PackSourceBundle {
  subject: { id: string; name: string; section?: 'primary' | 'secondary' | 'both' };
  questions: PackSourceQuestion[];
  assets: PackSourceAsset[];
}

export interface PackSourceData extends PackSourceBundle {
  exam: ExamDomainRecord;
}

// Exam settings interface
export interface ExamSettings {
  timing: {
    durationMin: number;
    questionTimeLimit?: number;
    warningThresholds: number[];
  };
  navigation: {
    allowSkipping: boolean;
    allowBackNavigation: boolean;
    showProgress: boolean;
  };
  shuffling: {
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    shuffleSeed?: string;
  };
  submission: {
    autoSubmitOnTimeout: boolean;
    allowEarlySubmission: boolean;
    requireAllAnswered: boolean;
  };
  access: {
    allowCalculator: boolean;
    allowReferenceMaterial: string[];
    fullScreenMode: boolean;
  };
}

// Question selection methods
export interface QuestionSelection {
  method: 'individual' | 'filter' | 'random' | 'import';
  questionIds?: string[];
  filter?: {
    subjectId?: string;
    levelId?: string;
    type?: string[];
    difficulty?: string[];
    topic?: string;
    tags?: string[];
    count?: number;
  };
}
