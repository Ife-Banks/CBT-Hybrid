import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../auth/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toCsv } from '../results/domain/csv';
import { writeXlsx } from '../results/domain/xlsx';
import { EXPORT_REPOSITORY, type ExportRepository } from './repositories/export.repository';

/** Supported file formats for `GET /exports/:name.:ext` (API spec 11.4). */
export type ExportFormat = 'csv' | 'xlsx';

export interface ExportContext {
  schoolId: string;
  actorId: string;
  actorRole?: string;
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

/** A rendered dataset: `columns` is the header row, `rows` is the body. */
interface TableData {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv; charset=utf-8';

const SHEET_NAMES: Record<string, string> = {
  students: 'Students',
  guardians: 'Guardians',
  invitations: 'Invitations',
  notifications: 'Notifications',
  audit: 'Audit log',
};

/**
 * School data exports (API spec 11.4, US-14.3). Builds a `.csv` or `.xlsx`
 * download for students, guardians, invitations, notifications or the audit
 * log. Producing an export is itself audited (`data.exported`).
 *
 * `attendance` is a documented export name but attendance is not modelled in the
 * cloud schema yet, so that name returns `404` rather than an empty file.
 */
@Injectable()
export class ExportsService {
  constructor(
    @Inject(EXPORT_REPOSITORY) private readonly repository: ExportRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async build(name: string, format: string, ctx: ExportContext): Promise<ExportFile> {
    const ext = format.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `Unsupported export format "${format}"; use csv or xlsx`,
      });
    }

    const table = await this.table(name, ctx.schoolId);

    const rows = [table.columns, ...table.rows];
    const body =
      ext === 'csv'
        ? Buffer.from(toCsv(rows), 'utf8')
        : Buffer.from(writeXlsx({ name: SHEET_NAMES[name] ?? name, rows }));

    // US-16.1 / API spec 11.4: an export is a tracked action.
    this.audit.record({
      action: 'data.exported',
      outcome: 'success',
      actorUserId: ctx.actorId,
      actorRole: ctx.actorRole,
      schoolId: ctx.schoolId,
      targetType: 'export',
      targetId: name,
      detail: { name, format: ext, rows: table.rows.length },
    });

    return {
      filename: `${name}.${ext}`,
      contentType: ext === 'csv' ? CSV_MIME : XLSX_MIME,
      body,
    };
  }

  private async table(name: string, schoolId: string): Promise<TableData> {
    switch (name) {
      case 'students': {
        const records = await this.repository.listStudents(schoolId);
        return {
          columns: [
            'Admission No',
            'First name',
            'Other names',
            'Last name',
            'Gender',
            'Date of birth',
            'Status',
          ],
          rows: records.map((row) => [
            row.admissionNo,
            row.firstName,
            row.otherNames,
            row.lastName,
            row.gender,
            row.dateOfBirth,
            row.status,
          ]),
        };
      }
      case 'guardians': {
        const records = await this.repository.listGuardians(schoolId);
        return {
          columns: ['Full name', 'Email', 'Phone', 'Relationship'],
          rows: records.map((row) => [row.fullName, row.email, row.phoneE164, row.relationship]),
        };
      }
      case 'invitations': {
        const records = await this.repository.listInvitations(schoolId);
        return {
          columns: ['Kind', 'Sent to', 'Channel', 'Status', 'Expires', 'Used', 'Created'],
          rows: records.map((row) => [
            row.kind,
            row.sentTo,
            row.channel,
            row.status,
            row.expiresAt,
            row.usedAt,
            row.createdAt,
          ]),
        };
      }
      case 'notifications': {
        const records = await this.notifications.listLog(schoolId);
        return {
          columns: ['Channel', 'Template', 'Status', 'Attempts', 'Created', 'Sent', 'Read'],
          rows: records.map((row) => [
            row.channel,
            row.template,
            row.status,
            row.attempts,
            iso(row.createdAt),
            iso(row.sentAt),
            iso(row.readAt),
          ]),
        };
      }
      case 'audit': {
        const records = await this.audit.listForExport(schoolId);
        return {
          columns: ['Time', 'Action', 'Outcome', 'Actor', 'Entity', 'Entity ID', 'IP', 'Request ID'],
          rows: records.map((row) => [
            row.at,
            row.action,
            row.outcome,
            row.actorUserId,
            row.entityType,
            row.entityId,
            row.ip,
            row.requestId,
          ]),
        };
      }
      case 'attendance':
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Attendance data is not available to export',
        });
      default:
        throw new BadRequestException({
          code: 'BAD_REQUEST',
          message: `Unknown export "${name}"`,
        });
    }
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
