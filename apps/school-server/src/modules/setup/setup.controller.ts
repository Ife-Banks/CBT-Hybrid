import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivationService } from './activation.service';
import { SetupService } from './setup.service';
import { parseActivate, parseBackupPath, parseConsolePin, parseSchoolName } from './dto/setup.dto';

/**
 * First-run setup API (spec 6.3 step 8). Served only by the school server and
 * reachable on the LAN like the rest of the console, so it stays usable before
 * the server has been activated or has a console PIN.
 */
@ApiTags('setup')
@Controller('api/v1/setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly activation: ActivationService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'First-run progress, school details and server address' })
  status() {
    return this.setup.getStatus();
  }

  @Post('console-pin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the initial console PIN (six digits)' })
  setConsolePin(@Body() body: unknown) {
    return this.setup.setConsolePin(parseConsolePin(body).pin);
  }

  @Post('school')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the school name shown on the console' })
  setSchoolName(@Body() body: unknown) {
    return this.setup.setSchoolName(parseSchoolName(body).name);
  }

  @Post('backup-path')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the second backup location (must be writable)' })
  setBackupPath(@Body() body: unknown) {
    return this.setup.setBackupPath(parseBackupPath(body).path);
  }

  @Post('activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this server with the cloud using an activation code' })
  async activate(@Body() body: unknown) {
    const dto = parseActivate(body);
    const result = await this.activation.activate({
      code: dto.activation_code,
      deviceName: dto.device_name,
      cloudUrl: dto.cloud_url,
    });
    await this.setup.markCompleteIfReady();
    return result;
  }

  @Get('lab-shortcut')
  @ApiOperation({ summary: 'Lab shortcut files (.url and kiosk .bat) for the lab PCs' })
  labShortcut() {
    return this.setup.getLabShortcut();
  }

  @Get('lab-shortcut.url')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="SchoolCBT-Exam.url"')
  @ApiOperation({ summary: 'Download the lab shortcut file' })
  async labShortcutUrl(): Promise<string> {
    return (await this.setup.getLabShortcut()).url_file;
  }

  @Get('lab-shortcut.bat')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="SchoolCBT-Exam.bat"')
  @ApiOperation({ summary: 'Download the kiosk launcher for the lab PCs' })
  async labShortcutBat(): Promise<string> {
    return (await this.setup.getLabShortcut()).bat;
  }
}
