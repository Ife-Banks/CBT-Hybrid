import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { schoolSettingsPatchSchema } from './settings.dto';
import { SettingsService } from './settings.service';

/** School settings (API spec 11.3). School Admin only. */
@Controller('settings')
@UseGuards(AuthGuard, AbilitiesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @CheckAbilities({ action: 'read', subject: 'Setting' })
  async get(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    return this.settings.get(schoolId);
  }

  @Patch()
  @CheckAbilities({ action: 'manage', subject: 'Setting' })
  async patch(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = schoolSettingsPatchSchema.parse(body);
    return this.settings.update(schoolId, dto);
  }
}
