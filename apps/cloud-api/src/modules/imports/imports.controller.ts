import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { requireSchool } from '../../common/request-context';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ImportsService } from './imports.service';
import type { ImportFormat, ImportKind, ImportRowStatus } from './domain/types';

/** The slice of the multipart file we read (memory storage). */
interface UploadedFileShape {
  originalname: string;
  buffer: Buffer;
}

/** The slice of the HTTP response the download routes use. */
interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
}

const KINDS: ImportKind[] = ['questions', 'students', 'guardians', 'teachers'];

/**
 * Import pipeline (API spec section 7). Templates, upload, row preview and
 * fix/skip, confirm, cancel and report. Authorisation is per-kind (`import` on
 * the matching subject) and enforced in the service.
 */
@Controller('imports')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('templates/:file')
  async template(@CurrentAuth() auth: AuthContext, @Res() res: DownloadResponse, @Param('file') file: string) {
    requireSchool(auth);
    const dot = file.lastIndexOf('.');
    const kind = file.slice(0, dot) as ImportKind;
    const format = file.slice(dot + 1) as ImportFormat;
    if (!KINDS.includes(kind)) throw badRequest(`Unknown import kind "${kind}".`);
    const template = this.imports.getTemplate(kind, format);
    res.setHeader('Content-Type', template.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
    res.send(template.body);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() body: Record<string, string>,
  ) {
    const schoolId = requireSchool(auth);
    if (!file) throw badRequest('A file is required.');
    const kind = (body.kind ?? '') as ImportKind;
    if (!KINDS.includes(kind)) throw badRequest(`Unknown import kind "${body.kind}".`);
    const format = kind === 'questions' && /\.docx$/i.test(file.originalname) ? 'docx' : extensionOf(file.originalname);
    if (!format) throw badRequest('The file must be .csv, .xlsx or .docx.');

    return this.imports.createJob({
      schoolId,
      role: auth.user.role,
      uploadedBy: auth.user.id,
      kind,
      format,
      file: { originalName: file.originalname, buffer: file.buffer },
      subjectId: body.subject_id || null,
      levelId: body.level_id || null,
    });
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query('kind') kind?: string,
    @Query('mine') mine?: string,
  ) {
    const schoolId = requireSchool(auth);
    return this.imports.listJobs(schoolId, auth.user.role, {
      kind: KINDS.includes(kind as ImportKind) ? (kind as ImportKind) : undefined,
      mine: mine === 'true' ? auth.user.id : undefined,
    });
  }

  @Get(':id')
  async detail(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.imports.getJob(requireSchool(auth), id);
  }

  @Get(':id/rows')
  async rows(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.imports.listRows(requireSchool(auth), id, {
      status: isRowStatus(status) ? status : undefined,
      cursor: cursor ? Number(cursor) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch(':id/rows/:rowId')
  async fixRow(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body() body: { parsed?: Record<string, unknown> },
  ) {
    const parsed = body?.parsed;
    if (!parsed || typeof parsed !== 'object') throw badRequest('A parsed object is required.');
    return this.imports.fixRow(requireSchool(auth), id, rowId, parsed);
  }

  @Post(':id/rows/:rowId/skip')
  @HttpCode(HttpStatus.OK)
  async skipRow(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('rowId') rowId: string,
  ) {
    return this.imports.skipRow(requireSchool(auth), id, rowId);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.imports.confirm(requireSchool(auth), id, auth.user.id);
  }

  @Get(':id/report.csv')
  async report(@CurrentAuth() auth: AuthContext, @Res() res: DownloadResponse, @Param('id') id: string) {
    const report = await this.imports.report(requireSchool(auth), id);
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.send(report.body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.imports.cancel(requireSchool(auth), id);
  }
}

function extensionOf(name: string): ImportFormat | null {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || extension === 'xlsx' || extension === 'docx') return extension;
  return null;
}

function isRowStatus(value: string | undefined): value is ImportRowStatus {
  return ['ok', 'warning', 'error', 'skipped', 'imported'].includes(value ?? '');
}

function badRequest(message: string): BadRequestException {
  return new BadRequestException({ code: 'IMPORT_FILE_REJECTED', message });
}
