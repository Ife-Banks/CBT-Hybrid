/**
 * Roles and permission names (CBT-04 M1: "permission names").
 *
 * This is a starter set covering the roles named in the product requirements.
 * It grows as endpoints are added; keep the string values stable once any are
 * persisted or referenced in the audit log.
 */

export const ROLES = [
  'platform_owner',
  'school_admin',
  'teacher',
  'invigilator',
  'parent',
  'student',
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Permission names, namespaced `resource:action`. Use `manage` as a wildcard
 * action where finer granularity is not yet needed.
 */
export const PERMISSIONS = {
  // Platform
  platformManageSchools: 'platform:manage_schools',
  platformManageLicences: 'platform:manage_licences',

  // School
  schoolManage: 'school:manage',
  schoolManageStaff: 'school:manage_staff',

  // Students and guardians
  studentRead: 'student:read',
  studentManage: 'student:manage',
  guardianRead: 'guardian:read',
  guardianManage: 'guardian:manage',

  // Questions and exams
  questionRead: 'question:read',
  questionManage: 'question:manage',
  examRead: 'exam:read',
  examManage: 'exam:manage',
  examPublish: 'exam:publish',
  sittingManage: 'sitting:manage',

  // Results and reports
  resultRead: 'result:read',
  resultRelease: 'result:release',
  reportRead: 'report:read',

  // Devices and sync
  deviceManage: 'device:manage',
  syncRun: 'sync:run',
  auditRead: 'audit:read',
  dataExport: 'data:export',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Default permissions per role. `school_admin` is scoped to one school. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform_owner: [
    PERMISSIONS.platformManageSchools,
    PERMISSIONS.platformManageLicences,
    PERMISSIONS.auditRead,
  ],
  school_admin: [
    PERMISSIONS.schoolManage,
    PERMISSIONS.schoolManageStaff,
    PERMISSIONS.studentManage,
    PERMISSIONS.studentRead,
    PERMISSIONS.guardianManage,
    PERMISSIONS.guardianRead,
    PERMISSIONS.questionManage,
    PERMISSIONS.questionRead,
    PERMISSIONS.examManage,
    PERMISSIONS.examRead,
    PERMISSIONS.examPublish,
    PERMISSIONS.sittingManage,
    PERMISSIONS.resultRead,
    PERMISSIONS.resultRelease,
    PERMISSIONS.reportRead,
    PERMISSIONS.deviceManage,
    PERMISSIONS.auditRead,
    PERMISSIONS.dataExport,
  ],
  teacher: [
    PERMISSIONS.studentRead,
    PERMISSIONS.questionManage,
    PERMISSIONS.questionRead,
    PERMISSIONS.examRead,
    PERMISSIONS.examManage,
    PERMISSIONS.sittingManage,
    PERMISSIONS.resultRead,
    PERMISSIONS.reportRead,
  ],
  invigilator: [PERMISSIONS.sittingManage, PERMISSIONS.studentRead, PERMISSIONS.examRead],
  parent: [PERMISSIONS.resultRead, PERMISSIONS.reportRead],
  student: [],
};
