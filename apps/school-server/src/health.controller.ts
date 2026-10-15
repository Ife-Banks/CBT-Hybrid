import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health(): { status: string; service: string; version: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'school-server',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
