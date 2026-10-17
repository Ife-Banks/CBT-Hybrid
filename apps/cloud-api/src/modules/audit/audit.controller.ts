import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../auth/audit/audit.service';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { auditLogQuerySchema } from './audit.dto';

/**
 * Audit log (API spec 11.4, US-16.1). Read-only: there is deliberately no
 * update or delete route. A school user sees only their own school's entries;
 * the platform owner sees every school.
 */
@Controller('audit-logs')
@UseGuards(AuthGuard, AbilitiesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @CheckAbilities({ action: 'read', subject: 'AuditLog' })
  async list(@CurrentAuth() auth: AuthContext, @Query() query: Record<string, string>) {
    const parsed = auditLogQuerySchema.parse(query);
    const page = await this.audit.query({
      // `undefined` means "no school filter" for the platform owner.
      schoolId: auth.user.schoolId ?? undefined,
      actorId: parsed.actor_id,
      action: parsed.action,
      entity: parsed.entity,
      from: parsed.from,
      to: parsed.to,
      cursor: parsed.cursor,
      limit: parsed.limit,
    });
    return { data: page.items, next_cursor: page.nextCursor };
  }
}
