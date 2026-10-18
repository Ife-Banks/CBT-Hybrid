import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateService } from './update.service';

/**
 * In-app updates (API spec section 17.5). Lives under the console prefix so it
 * inherits whatever guard the rest of the console API gets.
 */
@ApiTags('console')
@Controller('api/v1/console/updates')
export class UpdateController {
  constructor(private readonly updates: UpdateService) {}

  @Get()
  @ApiOperation({ summary: 'Current version, the offered release and what blocks applying it' })
  status() {
    return this.updates.getStatus();
  }

  @Post('check')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask the cloud whether a newer release is available' })
  check() {
    return this.updates.checkForUpdate();
  }

  @Post('download')
  @HttpCode(200)
  @ApiOperation({ summary: 'Download the offered release and verify its SHA-256' })
  download() {
    return this.updates.downloadUpdate();
  }

  @Post('apply')
  @HttpCode(202)
  @ApiOperation({ summary: 'Install the staged release; refused while a sitting is open' })
  apply() {
    return this.updates.applyUpdate();
  }
}
