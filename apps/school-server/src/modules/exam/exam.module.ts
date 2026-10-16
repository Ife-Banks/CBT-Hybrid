import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { ExamController } from './exam.controller';
import { ExamSessionService } from './exam-session.service';
import { LoginThrottleService } from './login-throttle.service';
import { PackImportService } from './pack-import.service';
import { SessionExpiryService } from './session-expiry.service';
import { TicketService } from './ticket.service';
import { SessionTokenGuard } from './guards/session-token.guard';
import {
  CATALOG_REPOSITORY,
  DrizzleCatalogRepository,
  DrizzleMetaRepository,
  DrizzleOutboxRepository,
  DrizzlePackRepository,
  DrizzleSessionRepository,
  META_REPOSITORY,
  OUTBOX_REPOSITORY,
  PACK_REPOSITORY,
  SESSION_REPOSITORY,
} from './repositories';

/**
 * School exam delivery (API spec section 16): the student exam API, pack import
 * and the session expiry sweep. Repositories are bound through tokens so the
 * services depend on interfaces, not the Drizzle implementations.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ExamController],
  providers: [
    ExamSessionService,
    PackImportService,
    TicketService,
    LoginThrottleService,
    SessionExpiryService,
    SessionTokenGuard,
    { provide: CATALOG_REPOSITORY, useClass: DrizzleCatalogRepository },
    { provide: PACK_REPOSITORY, useClass: DrizzlePackRepository },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: OUTBOX_REPOSITORY, useClass: DrizzleOutboxRepository },
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
  ],
  exports: [ExamSessionService, PackImportService, TicketService],
})
export class ExamModule {}
