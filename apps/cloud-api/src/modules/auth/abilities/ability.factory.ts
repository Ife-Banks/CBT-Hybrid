import { Injectable } from '@nestjs/common';
import { createMongoAbility, type MongoAbility } from '@casl/ability';
import {
  ROLE_ABILITIES,
  SCHOOL_SCOPED_SUBJECTS,
  type Action,
  type Role,
  type Subject,
} from '@cbt/shared-types';

/** The ability type used across the API: actions over subjects, with conditions. */
export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * A rule as we build it. Typed locally because CASL's `RawRuleOf<AppAbility>`
 * resolves its conditions generic to `never` for a plain `[Action, Subject]`
 * ability; the shape here is exactly what `createMongoAbility` accepts.
 */
interface RawAbilityRule {
  action: Action | Action[];
  subject: Subject | Subject[];
  conditions?: Record<string, unknown>;
}

/** `createMongoAbility`, typed to hand back an {@link AppAbility}. */
const buildAbility = createMongoAbility as unknown as (rules: RawAbilityRule[]) => AppAbility;

/** Minimal principal the factory needs. */
export interface AbilitySubject {
  role: Role;
  /** Null for the platform owner, who is not scoped to a school. */
  schoolId: string | null;
}

/**
 * Builds a CASL ability for a user (CBT-04 section 3.7). Rules come from the
 * role matrix in `@cbt/shared-types`; for every role except the platform owner
 * the school-owned subjects additionally carry a `{ school_id }` condition so a
 * request can never reach another tenant's rows.
 *
 * Repository-level scoping (teacher class/subject limits, parent guardianships)
 * is applied where the data is read; the ability expresses the school boundary.
 */
@Injectable()
export class AbilityFactory {
  createForUser(user: AbilitySubject): AppAbility {
    const rules: RawAbilityRule[] = [];

    for (const rule of ROLE_ABILITIES[user.role]) {
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];

      if (user.role === 'platform_owner' || !user.schoolId) {
        rules.push({ action: actions, subject: subjects });
        continue;
      }

      const scoped = subjects.filter((subject) => SCHOOL_SCOPED_SUBJECTS.includes(subject));
      const global = subjects.filter((subject) => !SCHOOL_SCOPED_SUBJECTS.includes(subject));

      if (scoped.length > 0) {
        rules.push({ action: actions, subject: scoped, conditions: { school_id: user.schoolId } });
      }
      if (global.length > 0) {
        rules.push({ action: actions, subject: global });
      }
    }

    return buildAbility(rules);
  }
}
