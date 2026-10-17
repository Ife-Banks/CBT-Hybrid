import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { gradeScaleSchema } from './dto/results.dto';
import { GradeScaleService } from './grade-scale.service';

/** Read and update the school's grade scale (settings contract 11.3, BR-18). */
@Controller('grade-scale')
@UseGuards(AuthGuard, AbilitiesGuard)
export class GradeScaleController {
  constructor(private readonly gradeScales: GradeScaleService) {}

  @Get()
  @CheckAbilities({ action: 'read', subject: 'Setting' })
  async get(@CurrentAuth() auth: AuthContext) {
    const schoolId = requireSchool(auth);
    return this.gradeScales.ensureDefault(schoolId);
  }

  @Put()
  @CheckAbilities({ action: 'manage', subject: 'Setting' })
  async update(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = gradeScaleSchema.parse(body);
    return this.gradeScales.setDefaultBands(schoolId, dto.bands, dto.name);
  }
}
