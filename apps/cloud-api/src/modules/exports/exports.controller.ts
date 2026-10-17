import { BadRequestException, Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ExportsService } from './exports.service';

/** The slice of the HTTP response the download route uses. */
interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
}

/**
 * Data exports (API spec 11.4, US-14.3). School Admin only. The path is
 * `<name>.<ext>`, for example `/exports/students.xlsx`; a single `:file`
 * segment is captured and split here so the route needs no dotted-param syntax.
 */
@Controller('exports')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(':file')
  @CheckAbilities({ action: 'read', subject: 'Export' })
  async download(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('file') file: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const dot = file.lastIndexOf('.');
    if (dot <= 0 || dot === file.length - 1) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Export path must be "<name>.<csv|xlsx>"',
      });
    }

    const name = file.slice(0, dot).toLowerCase();
    const ext = file.slice(dot + 1).toLowerCase();
    const result = await this.exports.build(name, ext, {
      schoolId,
      actorId: auth.user.id,
      actorRole: auth.user.role,
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.body);
  }
}
