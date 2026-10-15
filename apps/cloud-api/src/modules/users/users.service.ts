import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { StudentCodeGenerator, isValidCodeBody } from '@cbt/exam-core';
import * as argon2 from 'argon2';
import crypto from 'node:crypto';
import type {
  StudentRepository,
  StudentCodeRepository,
  GuardianRepository,
  GuardianshipRepository,
  InvitationRepository,
} from './repositories';
import type {
  CreateStudentDto,
  UpdateStudentDto,
  CreateGuardianDto,
  UpdateGuardianDto,
  CreateInvitationDto,
  StudentRecord,
  StudentCodeRecord,
  GuardianRecord,
  InvitationRecord,
} from './domain/types';

@Injectable()
export class UsersService {
  private readonly codeGenerator = new StudentCodeGenerator();

  constructor(
    private readonly studentRepo?: StudentRepository,
    private readonly studentCodeRepo?: StudentCodeRepository,
    private readonly guardianRepo?: GuardianRepository,
    private readonly guardianshipRepo?: GuardianshipRepository,
    private readonly invitationRepo?: InvitationRepository,
  ) {}

  // Student Management
  async createStudent(dto: CreateStudentDto, schoolId: string): Promise<StudentRecord> {
    // Check for duplicate admission number
    const existing = await this.studentRepo!.findByAdmissionNo(schoolId, dto.admissionNo);
    if (existing) {
      throw new ConflictException(`Student with admission number ${dto.admissionNo} already exists`);
    }

    return await this.studentRepo!.create(dto, schoolId);
  }

  async getStudent(id: string): Promise<StudentRecord> {
    const student = await this.studentRepo!.findById(id);
    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    return student;
  }

  async listStudents(schoolId: string): Promise<StudentRecord[]> {
    return await this.studentRepo!.findBySchoolId(schoolId);
  }

  async updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentRecord> {
    return await this.studentRepo!.update(id, dto);
  }

  async deleteStudent(id: string): Promise<void> {
    const student = await this.studentRepo!.findById(id);
    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    await this.studentRepo!.delete(id);
  }

  // Student Code Management
  async generateStudentCode(studentId: string, schoolCode: string, issuedBy: string): Promise<StudentCodeRecord> {
    const student = await this.studentRepo!.findById(studentId);
    if (!student) {
      throw new NotFoundException(`Student with ID ${studentId} not found`);
    }

    // Generate unique code body
    let codeBody: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      codeBody = this.codeGenerator.generateCodeBody();
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique student code after multiple attempts');
      }
    } while (!isValidCodeBody(codeBody));

    const fullCode = this.codeGenerator.formatFullCode(schoolCode, codeBody);

    return await this.studentCodeRepo!.create(studentId, fullCode, issuedBy);
  }

  async getStudentCode(studentId: string): Promise<StudentCodeRecord | null> {
    return await this.studentCodeRepo!.findActiveByStudentId(studentId);
  }

  async getStudentCodeHistory(studentId: string): Promise<StudentCodeRecord[]> {
    return await this.studentCodeRepo!.findByStudentId(studentId);
  }

  async revokeStudentCode(id: string, reason: string): Promise<StudentCodeRecord> {
    return await this.studentCodeRepo!.revoke(id, reason);
  }

  // Guardian Management
  async createGuardian(dto: CreateGuardianDto, schoolId: string): Promise<GuardianRecord> {
    // Check for duplicate phone within school
    if (dto.phoneE164) {
      const existing = await this.guardianRepo!.findByPhone(schoolId, dto.phoneE164);
      if (existing) {
        throw new ConflictException(`Guardian with phone ${dto.phoneE164} already exists`);
      }
    }

    return await this.guardianRepo!.create(dto, schoolId);
  }

  async getGuardian(id: string): Promise<GuardianRecord> {
    const guardian = await this.guardianRepo!.findById(id);
    if (!guardian) {
      throw new NotFoundException(`Guardian with ID ${id} not found`);
    }
    return guardian;
  }

  async listGuardians(schoolId: string): Promise<GuardianRecord[]> {
    return await this.guardianRepo!.findBySchoolId(schoolId);
  }

  async updateGuardian(id: string, dto: UpdateGuardianDto): Promise<GuardianRecord> {
    return await this.guardianRepo!.update(id, dto);
  }

  async deleteGuardian(id: string): Promise<void> {
    await this.guardianRepo!.delete(id);
  }

  // Guardianship Management
  async linkGuardianToStudent(
    guardianId: string,
    studentId: string,
    relationship?: string,
    canViewResults = true,
    canPayFees = true,
  ): Promise<void> {
    const existing = await this.guardianshipRepo!.find(guardianId, studentId);
    if (existing) {
      throw new ConflictException('Guardianship already exists');
    }

    await this.guardianshipRepo!.create({
      guardianId,
      studentId,
      relationship,
      canViewResults,
      canPayFees,
    });
  }

  async unlinkGuardianFromStudent(guardianId: string, studentId: string): Promise<void> {
    await this.guardianshipRepo!.delete(guardianId, studentId);
  }

  async getStudentGuardians(studentId: string): Promise<GuardianRecord[]> {
    const guardianships = await this.guardianshipRepo!.findByStudentId(studentId);
    const guardians: GuardianRecord[] = [];

    for (const gs of guardianships) {
      const guardian = await this.guardianRepo!.findById(gs.guardianId);
      if (guardian) {
        guardians.push(guardian);
      }
    }

    return guardians;
  }

  async getGuardianStudents(guardianId: string): Promise<StudentRecord[]> {
    const guardianships = await this.guardianshipRepo!.findByGuardianId(guardianId);
    const students: StudentRecord[] = [];

    for (const gs of guardianships) {
      const student = await this.studentRepo!.findById(gs.studentId);
      if (student) {
        students.push(student);
      }
    }

    return students;
  }

  // Invitation Management
  async createInvitation(dto: CreateInvitationDto, schoolId: string, createdBy: string): Promise<InvitationRecord> {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await argon2.hash(token, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const invitation = await this.invitationRepo!.create(dto, schoolId, tokenHash, createdBy);

    // In a real implementation, this would trigger email/SMS sending
    // For now, we return the token for testing purposes
    (invitation as any).token = token;

    return invitation;
  }

  async getInvitation(id: string): Promise<InvitationRecord> {
    const invitation = await this.invitationRepo!.findById(id);
    if (!invitation) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }
    return invitation;
  }

  async listInvitations(schoolId: string): Promise<InvitationRecord[]> {
    return await this.invitationRepo!.findBySchoolId(schoolId);
  }

  async useInvitation(id: string): Promise<InvitationRecord> {
    const invitation = await this.invitationRepo!.findById(id);
    if (!invitation) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    if (invitation.status !== 'pending' && invitation.status !== 'sent') {
      throw new ConflictException(`Invitation has already been ${invitation.status}`);
    }

    if (new Date() > invitation.expiresAt) {
      await this.invitationRepo!.markAsExpired(id);
      throw new ConflictException('Invitation has expired');
    }

    return await this.invitationRepo!.markAsUsed(id);
  }

  async revokeInvitation(id: string): Promise<InvitationRecord> {
    return await this.invitationRepo!.revoke(id);
  }
}
