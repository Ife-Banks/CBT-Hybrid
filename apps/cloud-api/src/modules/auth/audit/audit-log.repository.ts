import { Injectable } from '@nestjs/common';

/** Injection token for {@link AuditLogRepository}. */
export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

/** A persisted audit entry (API spec 11.4). `at` is an ISO-8601 timestamp. */
export interface AuditLogRecord {
  id: string;
  schoolId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  outcome: 'success' | 'failure';
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  detail: Record<string, unknown> | null;
  at: string;
}

/** An entry about to be written; the store fills in the id and timestamp. */
export interface NewAuditLogRecord {
  id?: string;
  schoolId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  outcome?: 'success' | 'failure';
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  detail?: Record<string, unknown> | null;
  at?: string;
}

export interface AuditLogQuery {
  /**
   * Restrict to one school. Omit for the platform owner's cross-school view; a
   * `null` matches entries written outside any school context.
   */
  schoolId?: string | null;
  actorId?: string;
  action?: string;
  /** Matches the affected resource type (`entity_type`). */
  entity?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface AuditLogPage {
  items: AuditLogRecord[];
  nextCursor: string | null;
}

export interface AuditLogRepository {
  insert(entry: NewAuditLogRecord): Promise<AuditLogRecord>;
  query(filter: AuditLogQuery): Promise<AuditLogPage>;
  /** Every entry for a school, oldest first; used by the CSV/XLSX export. */
  listForExport(schoolId: string): Promise<AuditLogRecord[]>;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;

/** Clamp a caller-supplied page size into range. */
export function clampAuditLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_AUDIT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_AUDIT_PAGE_SIZE);
}

/**
 * A page cursor is an opaque base64url of `<at>|<id>`. Ordering is `at` then `id`
 * both descending, so a cursor is the last row of the previous page.
 */
export function encodeAuditCursor(record: { at: string; id: string }): string {
  return Buffer.from(`${record.at}|${record.id}`, 'utf8').toString('base64url');
}

export function decodeAuditCursor(cursor: string): { at: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    if (separator <= 0 || separator === decoded.length - 1) return null;
    return { at: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function compareDesc(a: AuditLogRecord, b: AuditLogRecord): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function matchesFilter(row: AuditLogRecord, filter: AuditLogQuery): boolean {
  if (filter.schoolId !== undefined && row.schoolId !== filter.schoolId) return false;
  if (filter.actorId && row.actorUserId !== filter.actorId) return false;
  if (filter.action && row.action !== filter.action) return false;
  if (filter.entity && row.entityType !== filter.entity) return false;
  if (filter.from && new Date(row.at) < filter.from) return false;
  if (filter.to && new Date(row.at) > filter.to) return false;
  return true;
}

/**
 * Filter, sort newest-first and paginate a set of audit records. Pure so both
 * the in-memory store and the service fallback share exactly one implementation.
 */
export function paginateAuditLogs(
  records: readonly AuditLogRecord[],
  filter: AuditLogQuery,
): AuditLogPage {
  const limit = clampAuditLimit(filter.limit);
  const cursor = filter.cursor ? decodeAuditCursor(filter.cursor) : null;

  const sorted = records.filter((row) => matchesFilter(row, filter)).sort(compareDesc);
  const afterCursor = cursor
    ? sorted.filter((row) => row.at < cursor.at || (row.at === cursor.at && row.id < cursor.id))
    : sorted;

  const items = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > items.length;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeAuditCursor({ at: last.at, id: last.id }) : null,
  };
}

/** In-memory audit store for tests and local runs (no `DATABASE_URL`). */
@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly rows: AuditLogRecord[] = [];
  private counter = 0;

  async insert(entry: NewAuditLogRecord): Promise<AuditLogRecord> {
    this.counter += 1;
    const record: AuditLogRecord = {
      id: entry.id ?? `audit-${this.counter}`,
      schoolId: entry.schoolId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      outcome: entry.outcome ?? 'success',
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
      detail: entry.detail ?? null,
      at: entry.at ?? new Date().toISOString(),
    };
    this.rows.push(record);
    return clone(record);
  }

  async query(filter: AuditLogQuery): Promise<AuditLogPage> {
    return paginateAuditLogs(this.rows, filter);
  }

  async listForExport(schoolId: string): Promise<AuditLogRecord[]> {
    return this.rows
      .filter((row) => row.schoolId === schoolId)
      .sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1))
      .map(clone);
  }

  clear(): void {
    this.rows.length = 0;
    this.counter = 0;
  }
}

function clone(record: AuditLogRecord): AuditLogRecord {
  return { ...record, detail: record.detail ? { ...record.detail } : null };
}
