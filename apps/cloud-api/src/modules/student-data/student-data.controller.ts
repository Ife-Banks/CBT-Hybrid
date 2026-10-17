import { Controller, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StudentDataService } from './student-data.service';

/** The slice of the HTTP response the download route uses. */
interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
}

/**
 * Student data requests (API spec section 5, US-16.2). School Admin only:
 * exporting or anonymising a child's record is a data-protection action.
 */
@Controller('students')
@UseGuards(AuthGuard, AbilitiesGuard)
export class StudentDataController {
  constructor(private readonly studentData: StudentDataService) {}

  @Post(':id/data-export')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities({ action: 'manage', subject: 'Student' })
  async dataExport(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('id') id: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const file = await this.studentData.dataExport(schoolId, auth.user.id, auth.user.role, id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  }

  @Post(':id/anonymise')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities({ action: 'manage', subject: 'Student' })
  async anonymise(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const schoolId = requireSchool(auth);
    return this.studentData.anonymise(schoolId, auth.user.id, auth.user.role, id);
  }
}
