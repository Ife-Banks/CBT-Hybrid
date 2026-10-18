import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { parseRestore } from './dto/backup.dto';

/**
 * Backups and restores (API spec section 17.4, CBT-04 section 6.6). Lives under
 * the console prefix so it inherits whatever guard the rest of the console API
 * gets.
 */
@ApiTags('console')
@Controller('api/v1/console')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('backups')
  @ApiOperation({ summary: 'Local and second-location backups with size and checksum' })
  status() {
    return this.backups.getStatus();
  }

  @Post('backup/now')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take a backup now' })
  create() {
    return this.backups.createBackup('manual');
  }

  @Get('restore')
  @ApiOperation({ summary: 'Restorable backups, what blocks a restore and the last result' })
  restoreStatus() {
    return this.backups.getRestoreStatus();
  }

  @Post('restore')
  @HttpCode(202)
  @ApiOperation({ summary: 'Restore a backup; refused while a sitting is open' })
  restore(@Body() body: unknown) {
    return this.backups.restore(parseRestore(body).backup);
  }
}
