import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared/logger/logger.service';

/** A security-relevant event (sign-in, password change, 2FA change, ...). */
export interface AuditEvent {
  action: string;
  outcome: 'success' | 'failure';
  at: string;
  actorUserId?: string | null;
  schoolId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Audit sink for authentication events. Phase 2 keeps events in memory and
 * mirrors them to the structured logger; the durable `audit_logs` table arrives
 * with the data layer (CBT-04 M2 / Phase 3), at which point only this service
 * changes.
 */
@Injectable()
export class AuditService {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly logger: LoggerService) {}

  record(event: Omit<AuditEvent, 'at'>): void {
    const entry: AuditEvent = { ...event, at: new Date().toISOString() };
    this.events.push(entry);
    this.logger.log(
      `audit ${entry.action} ${entry.outcome}` +
        (entry.actorUserId ? ` actor=${entry.actorUserId}` : '') +
        (entry.targetId ? ` target=${entry.targetId}` : ''),
      'Audit',
    );
  }

  /** Snapshot of recorded events, oldest first. For tests and diagnostics. */
  list(): readonly AuditEvent[] {
    return this.events;
  }
}
