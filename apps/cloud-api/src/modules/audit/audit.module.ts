import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';

/** Read-only audit log endpoint (API spec 11.4, US-16.1). */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
})
export class AuditModule {}
