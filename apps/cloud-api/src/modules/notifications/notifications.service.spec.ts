import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService, chooseChannel } from './notifications.service';
import { InMemoryNotificationRepository } from './repositories/notification.repository';

const SCHOOL = 'school-1';

describe('NotificationsService', () => {
  let repository: InMemoryNotificationRepository;
  let service: NotificationsService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    service = new NotificationsService(repository);
  });

  it('chooses email, then sms, then in-app by contact details', () => {
    expect(
      chooseChannel({ id: 'g', schoolId: SCHOOL, userId: null, fullName: 'G', email: 'a@b.c', phoneE164: null }),
    ).toBe('email');
    expect(
      chooseChannel({ id: 'g', schoolId: SCHOOL, userId: null, fullName: 'G', email: null, phoneE164: '+234' }),
    ).toBe('sms');
    expect(
      chooseChannel({ id: 'g', schoolId: SCHOOL, userId: null, fullName: 'G', email: null, phoneE164: null }),
    ).toBe('in_app');
  });

  it('honours explicit parent preferences', () => {
    const guardian = {
      id: 'g',
      schoolId: SCHOOL,
      userId: null,
      fullName: 'G',
      email: 'a@b.c',
      phoneE164: '+234',
    };
    expect(chooseChannel(guardian, { inApp: true, email: false })).toBe('in_app');
    expect(chooseChannel(guardian, { whatsapp: true })).toBe('whatsapp');
  });

  it('queues a score-free release notification', async () => {
    const record = await service.queueResultsReleased({
      schoolId: SCHOOL,
      guardian: {
        id: 'g1',
        schoolId: SCHOOL,
        userId: 'u1',
        fullName: 'Parent',
        email: 'parent@example.com',
        phoneE164: null,
      },
      studentId: 'student-1',
      resultId: 'result-1',
    });
    expect(record.template).toBe('results_released');
    expect(record.channel).toBe('email');
    expect(record.status).toBe('queued');
    expect(JSON.stringify(record.payload)).not.toMatch(/percent|score/);
  });

  it('lists, retries and marks notifications read', async () => {
    const created = await service.enqueue({
      schoolId: SCHOOL,
      channel: 'in_app',
      template: 'results_released',
      payload: {},
    });
    await repository.update(created.id, { status: 'failed', error: 'boom' });

    const failed = await service.listLog(SCHOOL, { status: 'failed' });
    expect(failed).toHaveLength(1);
    const retried = await service.retry(SCHOOL, created.id);
    expect(retried.status).toBe('queued');

    const read = await service.markRead(created.id);
    expect(read.readAt).toBeInstanceOf(Date);
  });

  it('rejects retrying a notification from another school', async () => {
    const created = await service.enqueue({
      schoolId: SCHOOL,
      channel: 'in_app',
      template: 'x',
      payload: {},
    });
    await expect(service.retry('school-2', created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts paid-channel messages for the usage report', async () => {
    await service.enqueue({ schoolId: SCHOOL, channel: 'email', template: 'x', payload: {} });
    await service.enqueue({ schoolId: SCHOOL, channel: 'sms', template: 'x', payload: {} });
    await service.enqueue({ schoolId: SCHOOL, channel: 'whatsapp', template: 'x', payload: {} });
    const usage = await service.usage(SCHOOL);
    expect(usage.paidMessages).toBe(2);
    expect(usage.cap).toBeGreaterThan(0);
  });

  it('sweeps queued messages to sent', async () => {
    await service.enqueue({ schoolId: SCHOOL, channel: 'in_app', template: 'x', payload: {} });
    const sent = await service.dispatchQueued(SCHOOL);
    expect(sent).toBe(1);
    const queued = await service.listLog(SCHOOL, { status: 'queued' });
    expect(queued).toHaveLength(0);
  });
});
