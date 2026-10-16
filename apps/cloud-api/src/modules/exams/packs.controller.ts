import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { PackVerificationResult } from '@cbt/exam-core';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { ExamPackService } from './exam-pack.service';
import type { ExamPackDomainRecord } from './domain/types';
import { validatePackSchema } from './dto/exams.dto';

@Controller('packs')
@UseGuards(AuthGuard, AbilitiesGuard)
export class PacksController {
  constructor(private readonly examPackService: ExamPackService) {}

  @Get(':id')
  async getPack(@Param('id') id: string): Promise<ExamPackDomainRecord> {
    return this.examPackService.getPack(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const { pack, bytes } = await this.examPackService.downloadPack(id);
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="pack-${pack.examId}-v${pack.version}.cbtpack"`,
      length: pack.sizeBytes,
    });
  }

  @Post('validate')
  async validate(@Body() body: unknown, @Request() req: any): Promise<PackVerificationResult> {
    const dto = validatePackSchema.parse(body);
    return this.examPackService.validatePack({
      schoolId: req.user.schoolId,
      actorUserId: req.user.id,
      packId: dto.packId,
      bytes: dto.packBase64 ? new Uint8Array(Buffer.from(dto.packBase64, 'base64')) : undefined,
      packKey: dto.packKeyBase64 ? new Uint8Array(Buffer.from(dto.packKeyBase64, 'base64')) : undefined,
    });
  }
}
