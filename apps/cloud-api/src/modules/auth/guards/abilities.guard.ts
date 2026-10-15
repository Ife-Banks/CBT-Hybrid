import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHECK_ABILITIES_KEY, type RequiredAbility } from '../decorators/check-abilities.decorator';
import { AbilityFactory } from '../abilities/ability.factory';
import { AuthRequest } from '../http/request';
import { authRequired, forbidden } from '../http/errors';

/**
 * Enforces the abilities declared with `@CheckAbilities(...)`. Routes without a
 * declaration pass. Builds the caller's ability per request (CBT-04 section 3.7)
 * and returns `403 FORBIDDEN` when a required ability is missing.
 */
@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilities: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const rules = this.reflector.getAllAndOverride<RequiredAbility[]>(CHECK_ABILITIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules || rules.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.auth?.user;
    if (!user) throw authRequired();

    const ability = this.abilities.createForUser({ role: user.role, schoolId: user.schoolId });
    for (const rule of rules) {
      if (!ability.can(rule.action, rule.subject)) {
        throw forbidden(`Requires ${rule.action} on ${rule.subject}`);
      }
    }

    return true;
  }
}
