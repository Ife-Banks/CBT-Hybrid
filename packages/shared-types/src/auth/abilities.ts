/**
 * CASL vocabulary and the role ability matrix.
 *
 * API and Sync Specification section 1.3 says every cloud request runs a
 * "role check (CASL)"; CBT-04 section 3.7 says abilities are built per request
 * from the user's role and assignments. This module is the single source of
 * truth for that matrix, derived from the permissions summary in API spec
 * section 19.
 *
 * The coarse `PERMISSIONS` / `ROLE_PERMISSIONS` list in `../permissions.ts` is a
 * separate, flatter view used for documentation and auditing; the matrix here is
 * what the request-time ability factory consumes.
 */

import type { Role } from '../permissions';

/** CASL actions. `manage` is the wildcard action (all actions on a subject). */
export const ACTIONS = [
  'manage',
  'create',
  'read',
  'update',
  'delete',
  'execute',
  'publish',
  'release',
  'import',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * CASL subjects. `all` is the wildcard subject (all subjects). The remaining
 * values are the resource names shared with the frontends.
 */
export const SUBJECTS = [
  'all',
  'Platform',
  'Licence',
  'School',
  'User',
  'Teacher',
  'Guardian',
  'Student',
  'StudentCode',
  'Guardianship',
  'ClassSubject',
  'Question',
  'Exam',
  'Sitting',
  'Pack',
  'Result',
  'Report',
  'Invitation',
  'Device',
  'AuditLog',
  'Setting',
  'Dashboard',
  'Export',
] as const;

export type Subject = (typeof SUBJECTS)[number];

/** A single CASL rule: an action (or actions) allowed on a subject (or subjects). */
export interface RoleAbilityRule {
  action: Action | Action[];
  subject: Subject | Subject[];
}

/**
 * Subjects whose rows belong to a single school. For any role that is not the
 * platform owner, the ability factory adds a `{ school_id }` condition to rules
 * touching these subjects (CBT-04 section 3.7, "tenant scoping by `school_id`").
 */
export const SCHOOL_SCOPED_SUBJECTS: readonly Subject[] = [
  'School',
  'User',
  'Teacher',
  'Guardian',
  'Student',
  'StudentCode',
  'Guardianship',
  'ClassSubject',
  'Question',
  'Exam',
  'Sitting',
  'Pack',
  'Result',
  'Report',
  'Invitation',
  'Device',
  'Setting',
  'Dashboard',
  'Export',
];

/**
 * Role ability matrix (API spec section 19). `invigilator` and `student` have no
 * cloud abilities: they sign in only to the school server (school console and
 * school exam APIs respectively).
 */
export const ROLE_ABILITIES: Record<Role, RoleAbilityRule[]> = {
  platform_owner: [
    { action: 'manage', subject: ['Platform', 'Licence', 'School', 'Device'] },
    { action: 'read', subject: ['AuditLog', 'Exam'] },
    // The first school admin is created by the platform owner (API spec 4.2).
    { action: 'create', subject: 'Invitation' },
  ],
  school_admin: [
    {
      action: 'manage',
      subject: [
        'School',
        'User',
        'Teacher',
        'Guardian',
        'Student',
        'StudentCode',
        'Guardianship',
        'ClassSubject',
        'Question',
        'Exam',
        'Sitting',
        'Pack',
        'Result',
        'Report',
        'Invitation',
        'Device',
        'AuditLog',
        'Setting',
        'Dashboard',
        'Export',
      ],
    },
  ],
  teacher: [
    // Reads self; scoping to assigned classes/subjects is applied by repositories.
    { action: 'read', subject: 'Teacher' },
    { action: 'read', subject: ['Student', 'ClassSubject', 'Result', 'Report'] },
    { action: ['read', 'create', 'update', 'delete', 'import'], subject: 'Question' },
    { action: ['read', 'create', 'update', 'delete', 'publish'], subject: 'Exam' },
    { action: ['read', 'create', 'update', 'delete', 'execute'], subject: 'Sitting' },
    // Class teachers may release results where the release policy allows it;
    // the repository enforces the policy.
    { action: 'release', subject: 'Result' },
    { action: 'read', subject: 'Dashboard' },
  ],
  parent: [
    { action: 'read', subject: ['Guardian', 'Student', 'Result', 'Report'] },
    // Parents maintain their own contact details and notification preferences
    // (API spec section 10); the parent portal scopes every write to self.
    { action: 'update', subject: 'Guardian' },
  ],
  student: [],
  invigilator: [],
};
