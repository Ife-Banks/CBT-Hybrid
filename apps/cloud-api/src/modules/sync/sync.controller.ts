import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cloud Sync endpoints (API Spec section 15).
 * These are public endpoints that the school server calls to push/pull data.
 */
@Controller('sync/v1')
export class SyncController {
  constructor(private readonly config: ConfigService) {}

  // POST /sync/v1/results
  /**
   * Receive outbox events from school server.
   * Expected payload: { type: string, events: any[] }
   */
  @Post('results')
  @HttpCode(HttpStatus.OK)
  async receiveResults(@Body() body: any) {
    const { type, events } = body;
    if (!type || !Array.isArray(events)) {
      throw new NotFoundException('Invalid sync payload: missing type or events array');
    }
    // TODO: In production store events in database or process them
    console.log(`Sync received ${type} events:`, events);
    return { status: 'ok' };
  }

  // GET /sync/v1/roster
  /**
   * Return roster updates since last cursor.
   * In production this would return changed student records.
   */
  @Get('roster')
  @HttpCode(HttpStatus.OK)
  async getRoster() {
    // TODO: Return actual roster updates
    return {
      count: 0,
      cursor: new Date().toISOString(),
    };
  }

  // GET /sync/v1/packs
  /**
   * Return pack updates since last cursor.
   * In production this would return new/updated packs.
   */
  @Get('packs')
  @HttpCode(HttpStatus.OK)
  async getPacks() {
    // TODO: Return actual pack updates
    return {
      packs: [],
      cursor: new Date().toISOString(),
    };
  }
}