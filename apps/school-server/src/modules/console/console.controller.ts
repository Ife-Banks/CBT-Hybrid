import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { problem } from '../../common/http/problem';
import { ConsoleService } from './console.service';
import { parseLogin, parsePinChange, parsePinReset } from './dto/console.dto';

/**
 * Invigilator Console API (API spec section 17).
 * Base path: /api/v1/console
 */
@Controller('api/v1/console')
export class ConsoleController {
  constructor(private readonly consoleService: ConsoleService) {}

  /** `POST /login` - PIN sign-in for invigilators. */
  @Post('login')
  async login(@Body() body: unknown) {
    const dto = parseLogin(body);
    return this.consoleService.login(dto.pin, dto.label);
  }

  /** `POST /pin/change` - change the console PIN. */
  @Post('pin/change')
  async changePin(@Body() body: unknown) {
    const dto = parsePinChange(body);
    return this.consoleService.changePin(dto.old_pin, dto.new_pin);
  }

  /** `POST /pin/reset` - reset the console PIN with a reset code. */
  @Post('pin/reset')
  async resetPin(@Body() body: unknown) {
    const dto = parsePinReset(body);
    return this.consoleService.resetPin(dto.reset_code, dto.new_pin);
  }

  /** `GET /overview` - readiness and active session counts. */
  @Get('overview')
  async overview() {
    return this.consoleService.getOverview();
  }

  /** `POST /sittings/:id/open` - open a sitting. */
  @Post('sittings/:id/open')
  async openSitting(@Param('id') id: string) {
    return this.consoleService.openSitting(id);
  }

  /** `POST /sittings/:id/close` - close a sitting. */
  @Post('sittings/:id/close')
  async closeSitting(@Param('id') id: string) {
    return this.consoleService.closeSitting(id);
  }
}
