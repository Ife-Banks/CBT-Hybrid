import { Injectable } from '@nestjs/common';

/** Injection token for {@link ExportRepository}. */
export const EXPORT_REPOSITORY = Symbol('EXPORT_REPOSITORY');

/** A student row in the `students` export (API spec 11.4). */
export interface StudentExportRow {
  schoolId: string;
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: string | null;
  /** ISO-8601 date, or null. */
  dateOfBirth: string | null;
  status: string;
}

/** A guardian row in the `guardians` export. */
export interface GuardianExportRow {
  schoolId: string;
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  relationship: string | null;
}

/** An invitation row in the `invitations` export. */
export interface InvitationExportRow {
  schoolId: string;
  id: string;
  kind: string;
  channel: string;
  sentTo: string | null;
  status: string;
  /** ISO-8601 timestamps. */
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/**
 * Read-only view over the tables the School Admin can export (API spec 11.4,
 * US-14.3). Notifications and the audit log come from their own services.
 */
export interface ExportRepository {
  listStudents(schoolId: string): Promise<StudentExportRow[]>;
  listGuardians(schoolId: string): Promise<GuardianExportRow[]>;
  listInvitations(schoolId: string): Promise<InvitationExportRow[]>;
}

/** In-memory export source for tests and local runs (no `DATABASE_URL`). */
@Injectable()
export class InMemoryExportRepository implements ExportRepository {
  private readonly studentRows: StudentExportRow[] = [];
  private readonly guardianRows: GuardianExportRow[] = [];
  private readonly invitationRows: InvitationExportRow[] = [];

  seedStudent(row: StudentExportRow): void {
    this.studentRows.push({ ...row });
  }

  seedGuardian(row: GuardianExportRow): void {
    this.guardianRows.push({ ...row });
  }

  seedInvitation(row: InvitationExportRow): void {
    this.invitationRows.push({ ...row });
  }

  async listStudents(schoolId: string): Promise<StudentExportRow[]> {
    return this.studentRows.filter((row) => row.schoolId === schoolId).map((row) => ({ ...row }));
  }

  async listGuardians(schoolId: string): Promise<GuardianExportRow[]> {
    return this.guardianRows.filter((row) => row.schoolId === schoolId).map((row) => ({ ...row }));
  }

  async listInvitations(schoolId: string): Promise<InvitationExportRow[]> {
    return this.invitationRows.filter((row) => row.schoolId === schoolId).map((row) => ({ ...row }));
  }

  clear(): void {
    this.studentRows.length = 0;
    this.guardianRows.length = 0;
    this.invitationRows.length = 0;
  }
}
