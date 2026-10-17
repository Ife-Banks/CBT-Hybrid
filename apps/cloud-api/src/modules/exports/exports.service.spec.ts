import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readZip } from '@cbt/exam-core';
import { AuditService } from '../auth/audit/audit.service';
import { InMemoryAuditLogRepository } from '../auth/audit/audit-log.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { InMemoryNotificationRepository } from '../notifications/repositories/notification.repository';
import { LoggerService } from '../../shared/logger/logger.service';
import { ExportsService } from './exports.service';
import { InMemoryExportRepository } from './repositories/export.repository';

const SCHOOL = 'school-1';

describe('ExportsService', () => {
  let repository: InMemoryExportRepository;
  let notifications: NotificationsService;
  let audit: AuditService;
  let service: ExportsService;

  beforeEach(() => {
    repository = new InMemoryExportRepository();
    notifications = new NotificationsService(new InMemoryNotificationRepository());
    audit = new AuditService(new LoggerService(), new InMemoryAuditLogRepository());
    service = new ExportsService(repository, notifications, audit);

    repository.seedStudent({
      schoolId: SCHOOL,
      id: 's1',
      admissionNo: 'A-001',
      firstName: 'Ada',
      lastName: 'Obi',
      otherNames: 'N',
      gender: 'female',
      dateOfBirth: '2014-05-01T00:00:00.000Z',
      status: 'active',
    });
    repository.seedStudent({
      schoolId: 'school-2',
      id: 's2',
      admissionNo: 'A-999',
      firstName: 'Other',
      lastName: 'School',
      otherNames: null,
      gender: null,
      dateOfBirth: null,
      status: 'active',
    });
    repository.seedGuardian({
      schoolId: SCHOOL,
      id: 'g1',
      fullName: 'Obi Sr',
      email: 'obi@example.com',
      phoneE164: '+2348000000000',
      relationship: 'father',
    });
    repository.seedInvitation({
      schoolId: SCHOOL,
      id: 'i1',
      kind: 'staff',
      channel: 'email',
      sentTo: 'new@example.com',
      status: 'sent',
      expiresAt: '2026-01-08T00:00:00.000Z',
      usedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('exports students as CSV scoped to the school', async () => {
    const file = await service.build('students', 'csv', { schoolId: SCHOOL, actorId: 'u1' });
    expect(file.filename).toBe('students.csv');
    expect(file.contentType).toContain('text/csv');
    const text = file.body.toString('utf8');
    expect(text).toContain('Admission No');
    expect(text).toContain('A-001');
    expect(text).not.toContain('A-999');
  });

  it('exports students as a real xlsx workbook', async () => {
    const file = await service.build('students', 'xlsx', { schoolId: SCHOOL, actorId: 'u1' });
    expect(file.contentType).toContain('spreadsheetml');
    const entries = readZip(file.body);
    const sheet = new TextDecoder().decode(
      entries.find((entry) => entry.path === 'xl/worksheets/sheet1.xml')!.data,
    );
    expect(sheet).toContain('<t xml:space="preserve">A-001</t>');
  });

  it('exports guardians and invitations', async () => {
    const guardians = (await service.build('guardians', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).body.toString('utf8');
    expect(guardians).toContain('Obi Sr');
    expect(guardians).toContain('father');

    const invitations = (await service.build('invitations', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).body.toString('utf8');
    expect(invitations).toContain('new@example.com');
    expect(invitations).toContain('sent');
  });

  it('exports the notification log', async () => {
    await notifications.enqueue({
      schoolId: SCHOOL,
      channel: 'email',
      template: 'results_released',
      payload: {},
    });
    const text = (await service.build('notifications', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).body.toString('utf8');
    expect(text).toContain('results_released');
  });

  it('exports the audit log', async () => {
    audit.record({ action: 'results.released', outcome: 'success', schoolId: SCHOOL, actorUserId: 'u1' });
    const text = (await service.build('audit', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).body.toString('utf8');
    expect(text).toContain('results.released');
  });

  it('records a data.exported audit entry for each export', async () => {
    await service.build('students', 'csv', { schoolId: SCHOOL, actorId: 'u1', actorRole: 'school_admin' });
    const page = await audit.query({ schoolId: SCHOOL, action: 'data.exported' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ entityType: 'export', entityId: 'students', detail: { format: 'csv' } });
  });

  it('rejects an unknown name, an unknown format and unattendance', async () => {
    await expect(service.build('nonsense', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.build('students', 'pdf', { schoolId: SCHOOL, actorId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.build('attendance', 'csv', { schoolId: SCHOOL, actorId: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
