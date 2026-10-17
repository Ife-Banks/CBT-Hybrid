import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SyncController } from './sync.controller';
import { CloudSyncStore } from './sync.store';

describe('cloud sync API', () => {
  let app: INestApplication;
  let store: CloudSyncStore;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [CloudSyncStore],
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
  });

  it('starts with an empty roster and a numeric cursor', async () => {
    const res = await request(app.getHttpServer()).get('/sync/v1/roster').expect(200);
    expect(res.body.students).toEqual([]);
    expect(res.body.cursor).toBe('0');
  });

  it('upserts a roster record and returns it with a version', async () => {
    await request(app.getHttpServer())
      .post('/sync/v1/roster')
      .send({ id: 'st-1', fullName: 'Ada', classId: 'c1' })
      .expect(200);

    const res = await request(app.getHttpServer()).get('/sync/v1/roster').expect(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0]).toMatchObject({ id: 'st-1', fullName: 'Ada', version: 1 });
    expect(res.body.students[0].updated_at).toBeTruthy();

    const delta = await request(app.getHttpServer())
      .get(`/sync/v1/roster?since=${res.body.cursor}`)
      .expect(200);
    expect(delta.body.students).toEqual([]);
  });

  it('rejects a roster upsert without an id', async () => {
    await request(app.getHttpServer()).post('/sync/v1/roster').send({}).expect(400);
  });

  it('acknowledges results and rejects a malformed payload', async () => {
    const ok = await request(app.getHttpServer())
      .post('/sync/v1/results')
      .send({ type: 'result.scored', events: [{ event_id: 'ev-1' }] })
      .expect(200);
    expect(ok.body.accepted).toEqual(['ev-1']);

    await request(app.getHttpServer()).post('/sync/v1/results').send({ events: [] }).expect(400);
  });

  it('serves pack deltas', async () => {
    await request(app.getHttpServer())
      .post('/sync/v1/packs')
      .send({ pack_id: 'pack-1', pack_key: 'key', pack_bytes: 'bytes' })
      .expect(200);

    const res = await request(app.getHttpServer()).get('/sync/v1/packs').expect(200);
    expect(res.body.packs).toHaveLength(1);
    expect(res.body.packs[0].pack_id).toBe('pack-1');
  });
});
