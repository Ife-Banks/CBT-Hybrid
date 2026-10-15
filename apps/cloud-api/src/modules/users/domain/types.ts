/**
 * Domain types for user management operations.
 * These are the business entities used by the application layer,
 * separate from the database records.
 */

export interface StudentRecord {
  id: string;
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender?: 'M' | 'F';
  dateOfBirth?: Date;
  photoAssetId?: string;
  status: 'active' | 'graduated' | 'withdrawn' | 'transferred';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentCodeRecord {
  id: string;
  studentId: string;
  code: string;
  status: 'active' | 'revoked' | 'expired';
  issuedAt: Date;
  revokedAt?: Date;
  reason?: string;
  issuedBy?: string;
}

export interface GuardianRecord {
  id: string;
  schoolId: string;
  userId?: string;
  fullName: string;
  email?: string;
  phoneE164?: string;
  relationship?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardianshipRecord {
  guardianId: string;
  studentId: string;
  relationship?: string;
  canViewResults: boolean;
  canPayFees: boolean;
  createdAt: Date;
}

export interface TeacherProfileRecord {
  userId: string;
  staffNo?: string;
  title?: 'Mr' | 'Mrs' | 'Ms' | 'Dr' | 'Prof';
  department?: string;
  qualifications?: string;
  joinedDate?: Date;
  metadata: Record<string, unknown>;
}

export interface InvitationRecord {
  id: string;
  schoolId: string;
  kind: 'staff' | 'guardian' | 'password_reset';
  userId?: string;
  guardianId?: string;
  tokenHash: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'printed' | 'manual_link';
  sentTo?: string;
  status: 'pending' | 'sent' | 'used' | 'expired' | 'revoked' | 'failed';
  expiresAt: Date;
  createdBy?: string;
  usedAt?: Date;
  createdAt: Date;
}

export interface CreateStudentDto {
  admissionNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender?: 'M' | 'F';
  dateOfBirth?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateStudentDto {
  firstName?: string;
  lastName?: string;
  otherNames?: string;
  gender?: 'M' | 'F';
  dateOfBirth?: string;
  photoAssetId?: string;
  status?: 'active' | 'graduated' | 'withdrawn' | 'transferred';
  metadata?: Record<string, unknown>;
}

export interface CreateInvitationDto {
  kind: 'staff' | 'guardian' | 'password_reset';
  channel: 'email' | 'sms' | 'whatsapp' | 'printed' | 'manual_link';
  sentTo: string;
  guardianId?: string;
  expiresAt?: Date;
}

export interface CreateGuardianDto {
  fullName: string;
  email?: string;
  phoneE164?: string;
  relationship?: string;
}

export interface UpdateGuardianDto {
  fullName?: string;
  email?: string;
  phoneE164?: string;
  relationship?: string;
}
