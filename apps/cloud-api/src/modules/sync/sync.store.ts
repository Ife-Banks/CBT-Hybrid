import { Injectable, Logger } from '@nestjs/common';

/**
 * A cloud-side roster record as the school server sees it (API spec 13.4 / 15).
 * `version` and `updated_at` let the school detect and merge conflicts.
 */
export interface CloudRosterRecord {
  id: string;
  code: string;
  codeStatus: string;
  fullName: string;
  classId: string | null;
  section: string;
  photoPath: string | null;
  syncedAt: string;
  version: number;
  updated_at: string;
}

export interface CloudPackRecord {
  pack_id: string;
  pack_key: string;
  pack_bytes: string;
  version: number;
  updated_at: string;
}

export interface ReceiveEventsResult {
  status: 'ok';
  accepted: string[];
  rejected: string[];
}

interface Versioned {
  seq: number;
}

/**
 * In-memory, monotonic store backing the cloud sync endpoints.
 *
 * Every write bumps a global sequence number that acts as the delta cursor, so
 * a school can ask "what changed since cursor N" and receive exactly the
 * records it has not seen. Production replaces this with the cloud database;
 * the endpoint contract stays the same.
 */
@Injectable()
export class CloudSyncStore {
  private readonly logger = new Logger(CloudSyncStore.name);
  private seq = 0;
  private readonly roster = new Map<string, CloudRosterRecord & Versioned>();
  private readonly packs = new Map<string, CloudPackRecord & Versioned>();

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  /** Insert or update a roster record, bumping its version. */
  upsertRoster(
    input: Partial<CloudRosterRecord> & { id: string },
    now = new Date().toISOString(),
  ): CloudRosterRecord {
    const existing = this.roster.get(input.id);
    const record: CloudRosterRecord & Versioned = {
      id: input.id,
      code: input.code ?? existing?.code ?? '',
      codeStatus: input.codeStatus ?? existing?.codeStatus ?? 'active',
      fullName: input.fullName ?? existing?.fullName ?? '',
      classId: input.classId ?? existing?.classId ?? null,
      section: input.section ?? existing?.section ?? 'secondary',
      photoPath: input.photoPath ?? existing?.photoPath ?? null,
      syncedAt: now,
      version: (existing?.version ?? 0) + 1,
      updated_at: now,
      seq: this.nextSeq(),
    };
    this.roster.set(record.id, record);
    return CloudSyncStore.toPublic(record);
  }

  /** Roster records changed after `since` (a cursor value), plus the new cursor. */
  rosterSince(since?: string): { students: CloudRosterRecord[]; cursor: string; count: number } {
    const from = this.parseCursor(since);
    const students = [...this.roster.values()]
      .filter((record) => record.seq > from)
      .sort((a, b) => a.seq - b.seq)
      .map(({ seq: _seq, ...record }) => record);
    return { students, cursor: String(this.seq), count: students.length };
  }

  /** Insert or update a pack, bumping its version. */
  upsertPack(
    input: Partial<CloudPackRecord> & { pack_id: string },
    now = new Date().toISOString(),
  ): CloudPackRecord {
    const existing = this.packs.get(input.pack_id);
    const record: CloudPackRecord & Versioned = {
      pack_id: input.pack_id,
      pack_key: input.pack_key ?? existing?.pack_key ?? '',
      pack_bytes: input.pack_bytes ?? existing?.pack_bytes ?? '',
      version: (existing?.version ?? 0) + 1,
      updated_at: now,
      seq: this.nextSeq(),
    };
    this.packs.set(record.pack_id, record);
    return CloudSyncStore.toPublic(record);
  }

  /** Packs changed after `since`, plus the new cursor. */
  packsSince(since?: string): { packs: CloudPackRecord[]; cursor: string } {
    const from = this.parseCursor(since);
    const packs = [...this.packs.values()]
      .filter((record) => record.seq > from)
      .sort((a, b) => a.seq - b.seq)
      .map(({ seq: _seq, ...record }) => record);
    return { packs, cursor: String(this.seq) };
  }

  /**
   * Accept a batch of outbox events. Events without an `event_id` are rejected
   * so a school knows exactly which rows to retry.
   */
  receiveEvents(type: string, events: unknown[]): ReceiveEventsResult {
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const raw of events) {
      const event = raw as { event_id?: unknown };
      if (typeof event?.event_id === 'string' && event.event_id.length > 0) {
        accepted.push(event.event_id);
      } else {
        rejected.push('(missing event_id)');
      }
    }
    this.logger.debug(`Received ${accepted.length} ${type} events (${rejected.length} rejected)`);
    return { status: 'ok', accepted, rejected };
  }

  private static toPublic<T extends Versioned>(record: T): Omit<T, 'seq'> {
    const { seq: _seq, ...rest } = record;
    return rest;
  }

  private parseCursor(since?: string): number {
    if (!since) return 0;
    const parsed = Number(since);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  /** Clear all state (tests / demo reset). */
  reset(): void {
    this.seq = 0;
    this.roster.clear();
    this.packs.clear();
  }
}
