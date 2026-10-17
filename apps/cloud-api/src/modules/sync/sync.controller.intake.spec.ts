import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SyncController } from './sync.controller';
import { CloudSyncStore } from './sync.store';
import { ResultsIntakeService } from '../results/results-intake.service';

describe('cloud sync results intake', () => {
  let app: INestApplication;
  let store: CloudSyncStore;
  const intake = { processBatch: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [CloudSyncStore, { provide: ResultsIntakeService, useValue: intake }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    store = moduleRef.get(CloudSyncStore);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.reset();
    intake.processBatch.mockReset();
  });

  it('returns per-event outcomes from the intake', async () => {
    intake.processBatch.mockResolvedValueOnce([
      { event_id: 'ev-1', outcome: 'accepted' },
      { event_id: 'ev-2', outcome: 'rejected', code: 'STUDENT_UNKNOWN' },
    ]);

    const res = await request(app.getHttpServer())
      .post('/sync/v1/results')
      .send({
        type: 'session.submitted',
        events: [{ event_id: 'ev-1', payload: {} }, { event_id: 'ev-2', payload: {} }],
      })
      .expect(200);

    expect(res.body.accepted).toEqual(['ev-1']);
    expect(res.body.rejected).toEqual(['ev-2']);
    expect(res.body.results).toHaveLength(2);
    expect(intake.processBatch).toHaveBeenCalledWith('session.submitted', [
      { event_id: 'ev-1', payload: {} },
      { event_id: 'ev-2', payload: {} },
    ]);
  });

  it('rejects a malformed payload', async () => {
    await request(app.getHttpServer())
      .post('/sync/v1/results')
      .send({ events: [] })
      .expect(400);
  });
});
