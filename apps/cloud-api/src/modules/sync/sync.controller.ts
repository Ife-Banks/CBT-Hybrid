import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CloudSyncStore } from './sync.store';

/**
 * Cloud Sync endpoints (API Spec section 15).
 * These are the endpoints the school server calls to push results and pull
 * versioned roster and pack deltas. Each record carries a `version` and
 * `updated_at` so the school can detect conflicts, and the response `cursor` is
 * the delta watermark to pass back as `?since=`.
 */
@Controller('sync/v1')
export class SyncController {
  constructor(private readonly store: CloudSyncStore) {}

  /** POST /sync/v1/results - receive outbox events from a school server. */
  @Post('results')
  @HttpCode(HttpStatus.OK)
  async receiveResults(@Body() body: { type?: unknown; events?: unknown }) {
    const { type, events } = body ?? {};
    if (typeof type !== 'string' || !Array.isArray(events)) {
      throw new BadRequestException('Invalid sync payload: expected { type: string, events: unknown[] }');
    }
    return this.store.receiveEvents(type, events);
  }

  /** GET /sync/v1/roster - roster records changed since `since`. */
  @Get('roster')
  @HttpCode(HttpStatus.OK)
  async getRoster(@Query('since') since?: string) {
    return this.store.rosterSince(since);
  }

  /** GET /sync/v1/packs - packs changed since `since`. */
  @Get('packs')
  @HttpCode(HttpStatus.OK)
  async getPacks(@Query('since') since?: string) {
    return this.store.packsSince(since);
  }

  /**
   * POST /sync/v1/roster - upsert a roster record.
   * Backs the admin/import flow and makes the delta cursor demonstrable.
   */
  @Post('roster')
  @HttpCode(HttpStatus.OK)
  async upsertRoster(@Body() body: { id?: unknown }) {
    if (typeof body?.id !== 'string' || body.id.length === 0) {
      throw new BadRequestException('A roster record requires a string `id`');
    }
    return this.store.upsertRoster(body as { id: string });
  }

  /** POST /sync/v1/packs - upsert a pack. */
  @Post('packs')
  @HttpCode(HttpStatus.OK)
  async upsertPack(@Body() body: { pack_id?: unknown }) {
    if (typeof body?.pack_id !== 'string' || body.pack_id.length === 0) {
      throw new BadRequestException('A pack record requires a string `pack_id`');
    }
    return this.store.upsertPack(body as { pack_id: string });
  }
}
