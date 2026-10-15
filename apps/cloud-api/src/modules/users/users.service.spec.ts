import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import type {
  StudentRepository,
  StudentCodeRepository,
  GuardianRepository,
  GuardianshipRepository,
  InvitationRepository,
} from './repositories';
import type {
  StudentRecord,
  GuardianRecord,
  InvitationRecord,
  CreateStudentDto,
  CreateGuardianDto,
  CreateInvitationDto,
} from './domain/types';

describe('UsersService', () => {
  let service: UsersService;
  let studentRepo: StudentRepository;
  let studentCodeRepo: StudentCodeRepository;
  let guardianRepo: GuardianRepository;
  let guardianshipRepo: GuardianshipRepository;
  let invitationRepo: InvitationRepository;

  beforeEach(() => {
    studentRepo = {
      findById: async () => null,
      findBySchoolId: async () => [],
      findByAdmissionNo: async () => null,
      create: async () => ({}) as StudentRecord,
      update: async () => ({}) as StudentRecord,
      delete: async () => {},
    } as StudentRepository;

    studentCodeRepo = {
      findByStudentId: async () => null,
      findActiveByStudentId: async () => null,
      create: async () => ({}) as any,
      revoke: async () => ({}) as any,
      revokeAllForStudent: async () => {},
      findHistoryByStudentId: async () => [],
    } as StudentCodeRepository;

    guardianRepo = {
      findById: async () => null,
      findBySchoolId: async () => [],
      findByUserId: async () => null,
      findByPhone: async () => null,
      create: async () => ({}) as GuardianRecord,
      update: async () => ({}) as GuardianRecord,
      delete: async () => {},
    } as GuardianRepository;

    guardianshipRepo = {
      find: async () => null,
      findByGuardianId: async () => [],
      findByStudentId: async () => [],
      create: async () => ({}) as any,
      update: async () => ({}) as any,
      delete: async () => {},
    } as GuardianshipRepository;

    invitationRepo = {
      findById: async () => null,
      findByTokenHash: async () => null,
      findBySchoolId: async () => [],
      findByUserId: async () => [],
      findPendingByGuardianId: async () => [],
      create: async () => ({}) as InvitationRecord,
      markAsUsed: async () => ({}) as InvitationRecord,
      markAsSent: async () => ({}) as InvitationRecord,
      markAsExpired: async () => ({}) as InvitationRecord,
      revoke: async () => ({}) as InvitationRecord,
    } as InvitationRepository;

    service = new UsersService(
      studentRepo,
      studentCodeRepo,
      guardianRepo,
      guardianshipRepo,
      invitationRepo,
    );
  });

  describe('Student Management', () => {
    const mockStudent: StudentRecord = {
      id: 'student-1',
      schoolId: 'school-1',
      admissionNo: '2024001',
      firstName: 'John',
      lastName: 'Doe',
      otherNames: undefined,
      gender: 'M',
      dateOfBirth: new Date('2010-01-01'),
      photoAssetId: undefined,
      status: 'active',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('createStudent', () => {
      it('should create a student successfully', async () => {
        const dto: CreateStudentDto = {
          admissionNo: '2024001',
          firstName: 'John',
          lastName: 'Doe',
        };

        studentRepo.findByAdmissionNo = async () => null;
        studentRepo.create = async () => mockStudent;

        const result = await service.createStudent(dto, 'school-1');

        expect(result).toEqual(mockStudent);
      });

      it('should throw ConflictException if admission number exists', async () => {
        const dto: CreateStudentDto = {
          admissionNo: '2024001',
          firstName: 'John',
          lastName: 'Doe',
        };

        studentRepo.findByAdmissionNo = async () => mockStudent;

        await expect(service.createStudent(dto, 'school-1')).rejects.toThrow(
          ConflictException,
        );
      });
    });

    describe('getStudent', () => {
      it('should return a student', async () => {
        studentRepo.findById = async () => mockStudent;

        const result = await service.getStudent('student-1');

        expect(result).toEqual(mockStudent);
      });

      it('should throw NotFoundException if student not found', async () => {
        studentRepo.findById = async () => null;

        await expect(service.getStudent('student-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('listStudents', () => {
      it('should return students for a school', async () => {
        studentRepo.findBySchoolId = async () => [mockStudent];

        const result = await service.listStudents('school-1');

        expect(result).toEqual([mockStudent]);
      });
    });

    describe('deleteStudent', () => {
      it('should delete a student', async () => {
        studentRepo.findById = async () => mockStudent;
        studentRepo.delete = async () => {};

        await service.deleteStudent('student-1');
      });

      it('should throw NotFoundException if student not found', async () => {
        studentRepo.findById = async () => null;

        await expect(service.deleteStudent('student-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe('Guardian Management', () => {
    const mockGuardian: GuardianRecord = {
      id: 'guardian-1',
      schoolId: 'school-1',
      userId: undefined,
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phoneE164: '+1234567890',
      relationship: 'Mother',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('createGuardian', () => {
      it('should create a guardian successfully', async () => {
        const dto: CreateGuardianDto = {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
        };

        guardianRepo.findByPhone = async () => null;
        guardianRepo.create = async () => mockGuardian;

        const result = await service.createGuardian(dto, 'school-1');

        expect(result).toEqual(mockGuardian);
      });

      it('should throw ConflictException if phone exists', async () => {
        const dto: CreateGuardianDto = {
          fullName: 'Jane Doe',
          phoneE164: '+1234567890',
        };

        guardianRepo.findByPhone = async () => mockGuardian;

        await expect(service.createGuardian(dto, 'school-1')).rejects.toThrow(
          ConflictException,
        );
      });
    });

    describe('getGuardian', () => {
      it('should return a guardian', async () => {
        guardianRepo.findById = async () => mockGuardian;

        const result = await service.getGuardian('guardian-1');

        expect(result).toEqual(mockGuardian);
      });

      it('should throw NotFoundException if guardian not found', async () => {
        guardianRepo.findById = async () => null;

        await expect(service.getGuardian('guardian-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe('Invitation Management', () => {
    const mockInvitation: InvitationRecord = {
      id: 'inv-1',
      schoolId: 'school-1',
      kind: 'staff',
      userId: undefined,
      guardianId: undefined,
      tokenHash: 'hash',
      channel: 'email',
      sentTo: 'test@example.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: 'user-1',
      usedAt: undefined,
      createdAt: new Date(),
    };

    describe('createInvitation', () => {
      it('should create an invitation', async () => {
        const dto: CreateInvitationDto = {
          kind: 'staff',
          channel: 'email',
          sentTo: 'test@example.com',
        };

        invitationRepo.create = async () => mockInvitation;

        const result = await service.createInvitation(dto, 'school-1', 'user-1');

        expect(result).toEqual(mockInvitation);
      });
    });

    describe('useInvitation', () => {
      it('should mark invitation as used', async () => {
        invitationRepo.findById = async () => mockInvitation;
        invitationRepo.markAsUsed = async () => mockInvitation;

        const result = await service.useInvitation('inv-1');

        expect(result).toEqual(mockInvitation);
      });

      it('should throw NotFoundException if invitation not found', async () => {
        invitationRepo.findById = async () => null;

        await expect(service.useInvitation('inv-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});
