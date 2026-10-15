import type {
  Student,
  StudentCodeRecord as DbStudentCode,
  Guardian,
  Guardianship,
  TeacherProfile,
  Invitation,
} from '@cbt/shared-types';
import type {
  StudentRecord,
  StudentCodeRecord,
  GuardianRecord,
  GuardianshipRecord,
  TeacherProfileRecord,
  InvitationRecord,
} from './types';

export function mapStudentFromDb(row: Student): StudentRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    admissionNo: row.admissionNo,
    firstName: row.firstName,
    lastName: row.lastName,
    otherNames: row.otherNames ?? undefined,
    gender: row.gender ? (row.gender as 'M' | 'F') : undefined,
    dateOfBirth: row.dateOfBirth ?? undefined,
    photoAssetId: row.photoAssetId ?? undefined,
    status: row.status as StudentRecord['status'],
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapStudentCodeFromDb(row: DbStudentCode): StudentCodeRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    code: row.code,
    status: row.status as StudentCodeRecord['status'],
    issuedAt: row.issuedAt,
    revokedAt: row.revokedAt ?? undefined,
    reason: row.reason ?? undefined,
    issuedBy: row.issuedBy ?? undefined,
  };
}

export function mapGuardianFromDb(row: Guardian): GuardianRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId ?? undefined,
    fullName: row.fullName,
    email: row.email ?? undefined,
    phoneE164: row.phoneE164 ?? undefined,
    relationship: row.relationship ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapGuardianshipFromDb(row: Guardianship): GuardianshipRecord {
  return {
    guardianId: row.guardianId,
    studentId: row.studentId,
    relationship: row.relationship ?? undefined,
    canViewResults: row.canViewResults,
    canPayFees: row.canPayFees,
    createdAt: row.createdAt,
  };
}

export function mapTeacherProfileFromDb(row: TeacherProfile): TeacherProfileRecord {
  return {
    userId: row.userId,
    staffNo: row.staffNo ?? undefined,
    title: row.title ? (row.title as TeacherProfileRecord['title']) : undefined,
    department: row.department ?? undefined,
    qualifications: row.qualifications ?? undefined,
    joinedDate: row.joinedDate ?? undefined,
    metadata: row.metadata as Record<string, unknown>,
  };
}

export function mapInvitationFromDb(row: Invitation): InvitationRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    kind: row.kind as InvitationRecord['kind'],
    userId: row.userId ?? undefined,
    guardianId: row.guardianId ?? undefined,
    tokenHash: row.tokenHash,
    channel: row.channel as InvitationRecord['channel'],
    sentTo: row.sentTo ?? undefined,
    status: row.status as InvitationRecord['status'],
    expiresAt: row.expiresAt,
    createdBy: row.createdBy ?? undefined,
    usedAt: row.usedAt ?? undefined,
    createdAt: row.createdAt,
  };
}
