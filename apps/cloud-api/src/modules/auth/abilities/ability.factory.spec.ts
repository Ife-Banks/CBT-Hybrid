import { describe, expect, it } from 'vitest';
import { subject } from '@casl/ability';
import { AbilityFactory, type AppAbility } from './ability.factory';
import type { Role } from '@cbt/shared-types';

const abilities = new AbilityFactory();

function abilityFor(role: Role, schoolId: string | null = 'school-1'): AppAbility {
  return abilities.createForUser({ role, schoolId });
}

/** Check a rule against a row scoped to a school. */
function allowsRow(
  ability: AppAbility,
  action: 'manage' | 'read' | 'create' | 'release',
  subjectName: 'Exam' | 'Question' | 'Result' | 'School',
  schoolId: string,
): boolean {
  // `AppAbility` types `can` for plain subject names; condition matching needs
  // the tagged object form, so widen just for this assertion.
  const can = ability.can.bind(ability) as unknown as (a: string, s: object) => boolean;
  return can(action, subject(subjectName, { school_id: schoolId }));
}

describe('AbilityFactory (API spec section 19)', () => {
  describe('platform owner', () => {
    const ability = abilityFor('platform_owner', null);

    it('manages the platform but not school data', () => {
      expect(ability.can('manage', 'Platform')).toBe(true);
      expect(ability.can('manage', 'Licence')).toBe(true);
      expect(ability.can('read', 'AuditLog')).toBe(true);
      expect(ability.can('read', 'Exam')).toBe(true);
      expect(ability.can('create', 'Invitation')).toBe(true);
      expect(ability.can('read', 'Student')).toBe(false);
      expect(ability.can('manage', 'Result')).toBe(false);
    });

    it('is not scoped to a single school', () => {
      expect(allowsRow(ability, 'manage', 'School', 'any-school')).toBe(true);
    });
  });

  describe('school admin', () => {
    const ability = abilityFor('school_admin');

    it('manages school data', () => {
      expect(ability.can('manage', 'Exam')).toBe(true);
      expect(ability.can('manage', 'Student')).toBe(true);
      expect(ability.can('manage', 'Result')).toBe(true);
      expect(ability.can('read', 'AuditLog')).toBe(true);
      expect(ability.can('manage', 'Platform')).toBe(false);
    });

    it('is scoped to its own school', () => {
      expect(allowsRow(ability, 'manage', 'Exam', 'school-1')).toBe(true);
      expect(allowsRow(ability, 'manage', 'Exam', 'school-2')).toBe(false);
    });
  });

  describe('teacher', () => {
    const ability = abilityFor('teacher');

    it('works on the question bank and exams but not school administration', () => {
      expect(ability.can('create', 'Question')).toBe(true);
      expect(ability.can('read', 'Exam')).toBe(true);
      expect(ability.can('release', 'Result')).toBe(true);
      expect(ability.can('read', 'ClassSubject')).toBe(true);
      expect(ability.can('manage', 'School')).toBe(false);
      expect(ability.can('manage', 'User')).toBe(false);
      expect(ability.can('manage', 'Result')).toBe(false);
    });

    it('is scoped to its own school', () => {
      expect(allowsRow(ability, 'read', 'Exam', 'school-1')).toBe(true);
      expect(allowsRow(ability, 'read', 'Exam', 'school-2')).toBe(false);
    });
  });

  describe('parent', () => {
    const ability = abilityFor('parent');

    it('sees only released results and reports for linked children', () => {
      expect(ability.can('read', 'Result')).toBe(true);
      expect(ability.can('read', 'Report')).toBe(true);
      expect(ability.can('manage', 'Result')).toBe(false);
      expect(ability.can('manage', 'User')).toBe(false);
    });
  });

  describe('student and invigilator', () => {
    it('have no cloud abilities (school APIs only)', () => {
      for (const role of ['student', 'invigilator'] as const) {
        const ability = abilityFor(role, 'school-1');
        expect(ability.can('manage', 'Exam')).toBe(false);
        expect(ability.can('read', 'Exam')).toBe(false);
        expect(ability.can('read', 'Result')).toBe(false);
      }
    });
  });
});
