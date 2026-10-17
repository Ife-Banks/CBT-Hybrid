import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { InMemorySchoolSettingsRepository } from './settings.repository';
import { DEFAULT_SCHOOL_SETTINGS } from './settings.types';

const SCHOOL = 'school-1';

describe('SettingsService', () => {
  let repository: InMemorySchoolSettingsRepository;
  let service: SettingsService;

  beforeEach(() => {
    repository = new InMemorySchoolSettingsRepository();
    service = new SettingsService(repository);
  });

  it('returns the documented defaults for a school with no settings', async () => {
    expect(await service.get(SCHOOL)).toEqual(DEFAULT_SCHOOL_SETTINGS);
  });

  it('merges a patch over the stored settings and the defaults', async () => {
    await service.update(SCHOOL, { release_policy: 'class_teacher', paid_message_monthly_cap: 1000 });
    const settings = await service.get(SCHOOL);
    expect(settings.release_policy).toBe('class_teacher');
    expect(settings.paid_message_monthly_cap).toBe(1000);
    // untouched keys keep their defaults
    expect(settings.notify_on_remark).toBe(DEFAULT_SCHOOL_SETTINGS.notify_on_remark);
  });

  it('merges nested objects key-by-key', async () => {
    await service.update(SCHOOL, { paid_channels_enabled: { sms: true } });
    await service.update(SCHOOL, { paid_channels_enabled: { whatsapp: true } });
    expect((await service.get(SCHOOL)).paid_channels_enabled).toEqual({ sms: true, whatsapp: true });
  });

  it('preserves settings keys owned by other modules', async () => {
    repository.seed(SCHOOL, { something_else: 'keep me' });
    await service.update(SCHOOL, { strict_seats: true });
    expect((await repository.get(SCHOOL))?.something_else).toBe('keep me');
  });

  it('rejects an invalid value', async () => {
    await expect(
      service.update(SCHOOL, { release_policy: 'everyone' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(SCHOOL, { paid_message_monthly_cap: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
