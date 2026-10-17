import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { readZip } from '@cbt/exam-core';
import { AuditService } from '../auth/audit/audit.service';
import { InMemoryAuditLogRepository } from '../auth/audit/audit-log.repository';
import { SettingsService } from '../settings/settings.service';
import { InMemorySchoolSettingsRepository } from '../settings/settings.repository';
import { LoggerService } from '../../shared/logger/logger.service';
import { StudentDataService } from './student-data.service';
import { InMemoryStudentDataRepository } from './student-data.repository';

const SCHOOL = 'school-1';
const STUDENT = 'student-1';

describe('StudentDataService', () => {
  let repository: InMemoryStudentDataRepository;
  let settings: SettingsService;
  let audit: AuditService;
  let service: StudentDataService;

  beforeEach(() => {
    repository = new InMemoryStudentDataRepository();
    settings = new SettingsService(new InMemorySchoolSettingsRepository());
    audit = new AuditService(new LoggerService(), new InMemoryAuditLogRepository());
    service = new StudentDataService(repository, settings, audit);

    repository.seedProfile({
      id: STUDENT,
      schoolId: SCHOOL,
      admissionNo: 'A-001',
      firstName: 'Ada',
      lastName: 'Obi',
      otherNames: 'N',
      gender: 'F',
      dateOfBirth: '2014-05-01',
      photoAssetId: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    repository.seedGuardian(STUDENT, {
      id: 'g1',
      fullName: 'Obi Sr',
      email: 'obi@example.com',
      phoneE164: '+2348000000000',
      relationship: 'father',
      canViewResults: true,
    });
    repository.seedResult(STUDENT, {
      id: 'r1',
      examId: 'e1',
      examTitle: 'Mock Maths',
      status: 'released',
      score: 80,
      maxScore: 100,
      percent: 80,
      grade: 'A',
      releasedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('returns a ZIP of the student data and audits the export', async () => {
    const file = await service.dataExport(SCHOOL, 'u1', 'school_admin', STUDENT);

    expect(file.filename).toBe('student-A-001.zip');
    expect(file.contentType).toBe('application/zip');

    const entries = readZip(file.body);
    expect(entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['student.json', 'guardians.json', 'results.csv', 'README.txt']),
    );

    const decode = (path: string) =>
      new TextDecoder().decode(entries.find((entry) => entry.path === path)!.data);

    expect(JSON.parse(decode('student.json')).firstName).toBe('Ada');
    expect(JSON.parse(decode('guardians.json'))[0].fullName).toBe('Obi Sr');
    expect(decode('results.csv')).toContain('Mock Maths');

    const page = await audit.query({ schoolId: SCHOOL, action: 'data.exported' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ entityType: 'student', entityId: STUDENT });
  });

  it('404s a student owned by another school', async () => {
    await expect(
      service.dataExport('school-2', 'u1', 'school_admin', STUDENT),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('anonymises identity but keeps scores under the default retention', async () => {
    const result = await service.anonymise(SCHOOL, 'u1', 'school_admin', STUDENT);
    expect(result.scores_retained).toBe(true);

    const data = await repository.collect(STUDENT);
    expect(data!.profile.firstName).toBe('Anonymised');
    expect(data!.profile.admissionNo).toBe('ANON-STUDENT1');
    expect(data!.profile.gender).toBeNull();
    expect(data!.profile.dateOfBirth).toBeNull();
    expect(data!.results).toHaveLength(1);

    const page = await audit.query({ schoolId: SCHOOL, action: 'student.anonymised' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ entityType: 'student', entityId: STUDENT });
  });

  it('drops scores when the retention rule is zero', async () => {
    await settings.update(SCHOOL, { retention: { results_years_after_leaving: 0 } });

    const result = await service.anonymise(SCHOOL, 'u1', 'school_admin', STUDENT);
    expect(result.scores_retained).toBe(false);

    const data = await repository.collect(STUDENT);
    expect(data!.results).toHaveLength(0);
  });
});
