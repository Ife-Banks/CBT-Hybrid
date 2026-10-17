import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { NotificationsService } from './notifications.service';
import type { NotificationChannel, NotificationStatus } from '../results/domain/types';

/** Notification log and usage (API spec 11.2). */
@Controller('notifications')
@UseGuards(AuthGuard, AbilitiesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('log')
  @CheckAbilities({ action: 'read', subject: 'Setting' })
  async log(
    @CurrentAuth() auth: AuthContext,
    @Query('status') status?: NotificationStatus,
    @Query('channel') channel?: NotificationChannel,
  ) {
    const schoolId = requireSchool(auth);
    return { data: await this.notifications.listLog(schoolId, { status, channel }) };
  }

  @Post(':id/retry')
  @CheckAbilities({ action: 'manage', subject: 'Setting' })
  async retry(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const schoolId = requireSchool(auth);
    return this.notifications.retry(schoolId, id);
  }

  @Get('usage')
  @CheckAbilities({ action: 'read', subject: 'Setting' })
  async usage(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    return this.notifications.usage(schoolId);
  }
}
