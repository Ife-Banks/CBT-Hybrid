import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentAccountService } from './parent-account.service';
import { ParentPortalService } from './parent-portal.service';
import {
  parentEmailOtpSchema,
  parentEmailVerifySchema,
  updateParentProfileSchema,
} from './parent-account.dto';

/**
 * Parent portal (API spec section 10). Every route is scoped to the signed-in
 * guardian's linked children and only ever returns released results.
 */
@Controller('parent')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ParentPortalController {
  constructor(
    private readonly parent: ParentPortalService,
    private readonly account: ParentAccountService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('me')
  @CheckAbilities({ action: 'read', subject: 'Guardian' })
  async me(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    return this.account.getMe(schoolId, auth.user.id);
  }

  @Patch('me')
  @CheckAbilities({ action: 'update', subject: 'Guardian' })
  async updateMe(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = updateParentProfileSchema.parse(body);
    return this.account.updateMe(schoolId, auth.user.id, {
      ...(dto.notification_prefs ? { notificationPrefs: dto.notification_prefs } : {}),
    });
  }

  @Post('me/email/otp')
  @CheckAbilities({ action: 'update', subject: 'Guardian' })
  async requestEmailOtp(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = parentEmailOtpSchema.parse(body);
    return this.account.requestEmailOtp(schoolId, auth.user.id, { email: dto.email });
  }

  @Post('me/email/verify')
  @CheckAbilities({ action: 'update', subject: 'Guardian' })
  async verifyEmail(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = parentEmailVerifySchema.parse(body);
    return this.account.verifyEmailOtp(schoolId, auth.user.id, {
      challengeId: dto.challenge_id,
      code: dto.code,
      email: dto.email,
    });
  }

  @Get('children')
  @CheckAbilities({ action: 'read', subject: 'Student' })
  async children(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return { data: await this.parent.listChildren(schoolId, guardianId) };
  }

  @Get('children/:studentId/results')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async childResults(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId') studentId: string,
    @Query('subject_id') subjectId?: string,
    @Query('term_id') termId?: string,
  ) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return {
      data: await this.parent.getChildrenResults(schoolId, guardianId, studentId, { subjectId, termId }),
    };
  }

  @Get('children/:studentId/results/:resultId')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async childResult(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId') studentId: string,
    @Param('resultId') resultId: string,
  ) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return this.parent.getResultDetails(schoolId, guardianId, studentId, resultId);
  }

  @Get('children/:studentId/trends')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async childTrends(@CurrentAuth() auth: AuthContext, @Param('studentId') studentId: string) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return this.parent.getPerformanceHistory(schoolId, guardianId, studentId);
  }

  @Get('notifications')
  @CheckAbilities({ action: 'read', subject: 'Guardian' })
  async notificationsList(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return { data: await this.notifications.listForGuardian(schoolId, guardianId) };
  }

  @Post('notifications/:id/read')
  @CheckAbilities({ action: 'read', subject: 'Guardian' })
  async markRead(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const schoolId = requireSchool(auth);
    const guardianId = await this.parent.resolveGuardian(schoolId, auth.user.id);
    return this.notifications.markReadForGuardian(schoolId, guardianId, id);
  }
}
