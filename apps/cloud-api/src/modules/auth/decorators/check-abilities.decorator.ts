import { SetMetadata } from '@nestjs/common';
import type { Action, Subject } from '@cbt/shared-types';

/** Metadata key holding the CASL rules a route requires. */
export const CHECK_ABILITIES_KEY = 'auth:abilities';

/** One required ability: an action on a subject. */
export interface RequiredAbility {
  action: Action;
  subject: Subject;
}

/**
 * Declares the abilities a route needs. The global abilities guard builds the
 * caller's ability and returns `403 FORBIDDEN` unless every rule is satisfied.
 */
export const CheckAbilities = (...rules: RequiredAbility[]) =>
  SetMetadata(CHECK_ABILITIES_KEY, rules);
