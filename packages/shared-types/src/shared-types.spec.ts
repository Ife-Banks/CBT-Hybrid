import { describe, expect, it } from 'vitest';
import { HealthCheckSchema, ServiceHealthSchema } from './api/health';
import { FieldErrorSchema, ProblemDetailsSchema } from './api/errors';
import { ERROR_CATALOGUE, ERROR_CODES, errorStatus, isErrorCode } from './errors/error-codes';
import { ExamKeySchema, StudentCodeSchema } from './business/student-codes';
import { MarkingKeySchema, QuestionTypeSchema } from './business/exams';

describe('error catalogue (API spec section 2)', () => {
  it('exposes every code with a valid HTTP status', () => {
    expect(ERROR_CODES.length).toBeGreaterThan(20);
    for (const code of ERROR_CODES) {
      expect(errorStatus(code)).toBeGreaterThanOrEqual(400);
      expect(errorStatus(code)).toBeLessThan(600);
      expect(ERROR_CATALOGUE[code].title.length).toBeGreaterThan(0);
    }
  });

  it('recognises known and unknown codes', () => {
    expect(isErrorCode('VALIDATION_FAILED')).toBe(true);
    expect(isErrorCode('NOT_A_REAL_CODE')).toBe(false);
  });
});

describe('problem details', () => {
  it('accepts the API spec example', () => {
    const value = {
      type: 'https://docs.example.com/errors/validation-failed',
      title: 'Validation failed',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: '2 fields are invalid',
      errors: [{ field: 'options[1].body', code: 'REQUIRED', message: 'Option text is required' }],
      request_id: '01JA3Z6F2K8W4V0Q9E5T7N1XYB',
    };
    expect(ProblemDetailsSchema.parse(value)).toEqual(value);
    expect(FieldErrorSchema.parse(value.errors[0])).toEqual(value.errors[0]);
  });

  it('requires request_id', () => {
    expect(
      ProblemDetailsSchema.safeParse({ type: 't', title: 't', status: 400, code: 'BAD_REQUEST' })
        .success,
    ).toBe(false);
  });
});

describe('health', () => {
  it('accepts a health response', () => {
    const value = {
      status: 'ok',
      service: 'cloud-api',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
      uptime: '1m 0s',
      services: {
        database: { status: 'ok', responseTime: '45ms' },
        redis: { status: 'degraded', details: 'slow' },
      },
    };
    expect(HealthCheckSchema.parse(value)).toEqual(value);
    expect(ServiceHealthSchema.parse({ status: 'error' })).toEqual({ status: 'error' });
  });

  it('rejects an unknown service status', () => {
    expect(ServiceHealthSchema.safeParse({ status: 'fine' }).success).toBe(false);
  });
});

describe('business schemas', () => {
  it('accepts a valid student code shape and exam key', () => {
    expect(StudentCodeSchema.safeParse('GRA-7K2M9QXDG').success).toBe(true);
    expect(ExamKeySchema.safeParse('012345').success).toBe(true);
  });

  it('rejects a student code with excluded characters or wrong school length', () => {
    expect(StudentCodeSchema.safeParse('GRA-7K2M9QXD0').success).toBe(false);
    expect(StudentCodeSchema.safeParse('GR-7K2M9QXDG').success).toBe(false);
    expect(StudentCodeSchema.safeParse('GRA-7K2M9QXD').success).toBe(false);
    expect(ExamKeySchema.safeParse('12345').success).toBe(false);
  });

  it('validates marking keys and question types', () => {
    expect(QuestionTypeSchema.safeParse('multiple_choice').success).toBe(true);
    expect(
      MarkingKeySchema.safeParse({
        type: 'multiple_choice',
        marks: 3,
        correct_option_ids: ['A', 'C'],
      }).success,
    ).toBe(true);
    expect(MarkingKeySchema.safeParse({ type: 'nope', marks: 1 }).success).toBe(false);
  });
});
