import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm';
import { auditLogs, type AuditLog } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import {
  clampAuditLimit,
  decodeAuditCursor,
  encodeAuditCursor,
  type AuditLogPage,
  type AuditLogQuery,
  type AuditLogRecord,
  type AuditLogRepository,
  type NewAuditLogRecord,
} from './audit-log.repository';

/** Durable, append-only audit store (API spec 11.4, US-16.1). */
@Injectable()
export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async insert(entry: NewAuditLogRecord): Promise<AuditLogRecord> {
    const rows = await this.db
      .insert(auditLogs)
      .values({
        ...(entry.id ? { id: entry.id } : {}),
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
        ...(entry.at ? { at: new Date(entry.at) } : {}),
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to write audit log');
    return mapAuditLog(row);
  }

  async query(filter: AuditLogQuery): Promise<AuditLogPage> {
    const limit = clampAuditLimit(filter.limit);
    const conditions = [];

    if (filter.schoolId !== undefined) {
      conditions.push(
        filter.schoolId === null ? isNull(auditLogs.schoolId) : eq(auditLogs.schoolId, filter.schoolId),
      );
    }
    if (filter.actorId) conditions.push(eq(auditLogs.actorUserId, filter.actorId));
    if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
    if (filter.entity) conditions.push(eq(auditLogs.entityType, filter.entity));
    if (filter.from) conditions.push(gte(auditLogs.at, filter.from));
    if (filter.to) conditions.push(lte(auditLogs.at, filter.to));

    const cursor = filter.cursor ? decodeAuditCursor(filter.cursor) : null;
    if (cursor) {
      const at = new Date(cursor.at);
      conditions.push(
        or(
          lt(auditLogs.at, at),
          and(eq(auditLogs.at, at), lt(auditLogs.id, cursor.id)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapAuditLog);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeAuditCursor({ at: last.at, id: last.id }) : null,
    };
  }

  async listForExport(schoolId: string): Promise<AuditLogRecord[]> {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.schoolId, schoolId))
      .orderBy(auditLogs.at);
    return rows.map(mapAuditLog);
  }
}

function mapAuditLog(row: AuditLog): AuditLogRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    action: row.action,
    outcome: row.outcome,
    entityType: row.entityType,
    entityId: row.entityId,
    ip: row.ip,
    userAgent: row.userAgent,
    requestId: row.requestId,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
    at: row.at.toISOString(),
  };
}
