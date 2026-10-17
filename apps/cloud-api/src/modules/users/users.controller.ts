import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuditService } from '../auth/audit/audit.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  // Student endpoints
  @Post('students')
  async createStudent(@Body() dto: CreateStudentDto, @Request() req: any) {
    const student = await this.usersService.createStudent(dto, req.user.schoolId);
    this.auditService.record({
      action: 'student.created',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: student.id,
    });
    return student;
  }

  @Get('students/:id')
  async getStudent(@Param('id') id: string) {
    return await this.usersService.getStudent(id);
  }

  @Get('students')
  async listStudents(@Request() req: any) {
    return await this.usersService.listStudents(req.user.schoolId);
  }

  @Put('students/:id')
  async updateStudent(@Param('id') id: string, @Body() dto: UpdateStudentDto, @Request() req: any) {
    const student = await this.usersService.updateStudent(id, dto);
    this.auditService.record({
      action: 'student.updated',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
    return student;
  }

  @Delete('students/:id')
  async deleteStudent(@Param('id') id: string, @Request() req: any) {
    await this.usersService.deleteStudent(id);
    this.auditService.record({
      action: 'student.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
  }

  // Student code endpoints
  @Post('students/:id/code')
  async generateStudentCode(@Param('id') id: string, @Request() req: any) {
    const code = await this.usersService.generateStudentCode(id, req.user.school.code, req.user.id);
    this.auditService.record({
      action: 'studentCode.generated',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
    return code;
  }

  @Get('students/:id/code')
  async getStudentCode(@Param('id') id: string) {
    return await this.usersService.getStudentCode(id);
  }

  @Get('students/:id/code/history')
  async getStudentCodeHistory(@Param('id') id: string) {
    return await this.usersService.getStudentCodeHistory(id);
  }

  @Delete('student-codes/:id')
  async revokeStudentCode(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const code = await this.usersService.revokeStudentCode(id, reason);
    this.auditService.record({
      action: 'studentCode.revoked',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
      detail: { reason },
    });
    return code;
  }

  // Guardian endpoints
  @Post('guardians')
  async createGuardian(@Body() dto: CreateGuardianDto, @Request() req: any) {
    const guardian = await this.usersService.createGuardian(dto, req.user.schoolId);
    this.auditService.record({
      action: 'guardian.created',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: guardian.id,
    });
    return guardian;
  }

  @Get('guardians/:id')
  async getGuardian(@Param('id') id: string) {
    return await this.usersService.getGuardian(id);
  }

  @Get('guardians')
  async listGuardians(@Request() req: any) {
    return await this.usersService.listGuardians(req.user.schoolId);
  }

  @Delete('guardians/:id')
  async deleteGuardian(@Param('id') id: string, @Request() req: any) {
    await this.usersService.deleteGuardian(id);
    this.auditService.record({
      action: 'guardian.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
  }

  // Guardianship endpoints
  @Post('guardians/:guardianId/students/:studentId')
  async linkGuardianToStudent(
    @Param('guardianId') guardianId: string,
    @Param('studentId') studentId: string,
    @Body('relationship') relationship?: string,
    @Body('canViewResults') canViewResults = true,
    @Body('canPayFees') canPayFees = true,
    @Request() req?: any,
  ) {
    await this.usersService.linkGuardianToStudent(
      guardianId,
      studentId,
      relationship,
      canViewResults,
      canPayFees,
    );
    if (req) {
      this.auditService.record({
        action: 'guardianship.created',
        outcome: 'success',
        actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
        detail: { guardianId, studentId },
      });
    }
  }

  @Delete('guardians/:guardianId/students/:studentId')
  async unlinkGuardianFromStudent(
    @Param('guardianId') guardianId: string,
    @Param('studentId') studentId: string,
    @Request() req: any,
  ) {
    await this.usersService.unlinkGuardianFromStudent(guardianId, studentId);
    this.auditService.record({
      action: 'guardianship.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      detail: { guardianId, studentId },
    });
  }

  @Get('students/:studentId/guardians')
  async getStudentGuardians(@Param('studentId') studentId: string) {
    return await this.usersService.getStudentGuardians(studentId);
  }

  @Get('guardians/:guardianId/students')
  async getGuardianStudents(@Param('guardianId') guardianId: string) {
    return await this.usersService.getGuardianStudents(guardianId);
  }

  // Invitation endpoints
  @Post('invitations')
  async createInvitation(@Body() dto: CreateInvitationDto, @Request() req: any) {
    const invitation = await this.usersService.createInvitation(dto, req.user.schoolId, req.user.id);
    this.auditService.record({
      action: 'invitation.created',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: invitation.id,
    });
    return invitation;
  }

  @Get('invitations/:id')
  async getInvitation(@Param('id') id: string) {
    return await this.usersService.getInvitation(id);
  }

  @Get('invitations')
  async listInvitations(@Request() req: any) {
    return await this.usersService.listInvitations(req.user.schoolId);
  }

  @Post('invitations/:id/use')
  async useInvitation(@Param('id') id: string, @Request() req: any) {
    const invitation = await this.usersService.useInvitation(id);
    this.auditService.record({
      action: 'invitation.used',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
    return invitation;
  }

  @Delete('invitations/:id')
  async revokeInvitation(@Param('id') id: string, @Request() req: any) {
    const invitation = await this.usersService.revokeInvitation(id);
    this.auditService.record({
      action: 'invitation.revoked',
      outcome: 'success',
      actorUserId: req.user.id,
      actorRole: req.user.role,
      schoolId: req.user.schoolId,
      targetId: id,
    });
    return invitation;
  }
}
