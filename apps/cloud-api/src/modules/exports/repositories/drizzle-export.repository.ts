import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { guardians, invitations, students } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import type {
  ExportRepository,
  GuardianExportRow,
  InvitationExportRow,
  StudentExportRow,
} from './export.repository';

/** Drizzle-backed export source (API spec 11.4). */
@Injectable()
export class DrizzleExportRepository implements ExportRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async listStudents(schoolId: string): Promise<StudentExportRow[]> {
    const rows = await this.db
      .select()
      .from(students)
      .where(eq(students.schoolId, schoolId))
      .orderBy(students.admissionNo);
    return rows.map((row) => ({
      schoolId: row.schoolId,
      id: row.id,
      admissionNo: row.admissionNo,
      firstName: row.firstName,
      lastName: row.lastName,
      otherNames: row.otherNames,
      gender: row.gender,
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString() : null,
      status: row.status,
    }));
  }

  async listGuardians(schoolId: string): Promise<GuardianExportRow[]> {
    const rows = await this.db
      .select()
      .from(guardians)
      .where(eq(guardians.schoolId, schoolId))
      .orderBy(guardians.fullName);
    return rows.map((row) => ({
      schoolId: row.schoolId,
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phoneE164: row.phoneE164,
      relationship: row.relationship,
    }));
  }

  async listInvitations(schoolId: string): Promise<InvitationExportRow[]> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.schoolId, schoolId))
      .orderBy(desc(invitations.createdAt));
    return rows.map((row) => ({
      schoolId: row.schoolId,
      id: row.id,
      kind: row.kind,
      channel: row.channel,
      sentTo: row.sentTo,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
