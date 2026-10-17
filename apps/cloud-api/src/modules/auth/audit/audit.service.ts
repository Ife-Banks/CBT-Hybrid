import { Inject, Injectable, Optional } from '@nestjs/common';
import { LoggerService } from '../../../shared/logger/logger.service';
import {
  AUDIT_LOG_REPOSITORY,
  paginateAuditLogs,
  type AuditLogPage,
  type AuditLogQuery,
  type AuditLogRecord,
  type AuditLogRepository,
} from './audit-log.repository';

/** A security-relevant event (sign-in, password change, 2FA change, ...). */
export interface AuditEvent {
  action: string;
  outcome: 'success' | 'failure';
  at: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  schoolId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Audit sink. Every event is mirrored to the structured logger and persisted to
 * the append-only `audit_logs` table (API spec 11.4, US-16.1). The in-memory
 * `events` buffer is kept for tests and diagnostics.
 */
@Injectable()
export class AuditService {
  private readonly events: AuditEvent[] = [];

  constructor(
    private readonly logger: LoggerService,
    @Optional()
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository?: AuditLogRepository,
  ) {}

  record(event: Omit<AuditEvent, 'at'>): void {
    const entry: AuditEvent = { ...event, at: new Date().toISOString() };
    this.events.push(entry);
    this.logger.log(
      `audit ${entry.action} ${entry.outcome}` +
        (entry.actorUserId ? ` actor=${entry.actorUserId}` : '') +
        (entry.targetId ? ` target=${entry.targetId}` : ''),
      'Audit',
    );

    if (this.repository) {
      void this.repository
        .insert({
          schoolId: entry.schoolId ?? null,
          actorUserId: entry.actorUserId ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          outcome: entry.outcome,
          entityType: entry.targetType ?? null,
          entityId: entry.targetId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          requestId: entry.requestId ?? null,
          detail: entry.detail ?? null,
          at: entry.at,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to persist audit entry ${entry.action}`,
            error instanceof Error ? error.message : String(error),
            'Audit',
          );
        });
    }
  }

  /** Snapshot of recorded events, oldest first. For tests and diagnostics. */
  list(): readonly AuditEvent[] {
    return this.events;
  }

  /** Query persisted entries, newest first (API spec 11.4). */
  async query(filter: AuditLogQuery): Promise<AuditLogPage> {
    if (this.repository) return this.repository.query(filter);
    return paginateAuditLogs(this.events.map(toRecord), filter);
  }

  /** Every persisted entry for a school, oldest first; used by data exports. */
  async listForExport(schoolId: string): Promise<AuditLogRecord[]> {
    if (this.repository) return this.repository.listForExport(schoolId);
    return this.events.filter((event) => event.schoolId === schoolId).map(toRecord);
  }
}

function toRecord(event: AuditEvent): AuditLogRecord {
  return {
    id: `${event.at}:${event.action}`,
    schoolId: event.schoolId ?? null,
    actorUserId: event.actorUserId ?? null,
    actorRole: event.actorRole ?? null,
    action: event.action,
    outcome: event.outcome,
    entityType: event.targetType ?? null,
    entityId: event.targetId ?? null,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    requestId: event.requestId ?? null,
    detail: event.detail ?? null,
    at: event.at,
  };
}
