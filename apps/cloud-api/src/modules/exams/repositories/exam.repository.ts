import type { ExamDomainRecord, CreateExamDto, UpdateExamDto } from '../domain/types';

export interface ExamRepository {
  create(dto: CreateExamDto, schoolId: string, createdBy: string): Promise<ExamDomainRecord>;
  findById(id: string): Promise<ExamDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<ExamDomainRecord[]>;
  findBySubjectId(subjectId: string): Promise<ExamDomainRecord[]>;
  update(id: string, dto: UpdateExamDto): Promise<ExamDomainRecord>;
  delete(id: string): Promise<void>;
  addQuestion(examId: string, questionId: string, position: number, marksOverride?: number): Promise<void>;
  removeQuestion(examId: string, questionId: string): Promise<void>;
  getQuestions(examId: string): Promise<Array<{ questionId: string; position: number; marksOverride?: number }>>;
}
