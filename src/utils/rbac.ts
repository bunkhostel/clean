import { AppRoute, Permission, UserRole } from '../types';

/** Highest privilege first. */
export const ROLE_ORDER: UserRole[] = ['admin', 'manager', 'front_office', 'housekeeping'];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  front_office: 'Front Office',
  housekeeping: 'Housekeeping',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full system access, including user management',
  manager: 'Cleanliness form, daily reports, audit logs, staff quality scores',
  front_office: 'Cleanliness form and daily reports',
  housekeeping: 'Cleanliness form only',
};

const ROLE_RANK: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  front_office: 2,
  housekeeping: 1,
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'submit_cleanliness_form',
    'view_daily_reports',
    'view_audit_logs',
    'view_quality_scores',
    'manage_users',
  ],
  manager: ['submit_cleanliness_form', 'view_daily_reports', 'view_audit_logs', 'view_quality_scores'],
  front_office: ['submit_cleanliness_form', 'view_daily_reports'],
  housekeeping: ['submit_cleanliness_form'],
};

const ROUTE_PERMISSIONS: Record<Exclude<AppRoute, 'login'>, Permission> = {
  'cleanliness-form': 'submit_cleanliness_form',
  dashboard: 'view_daily_reports',
  'daily-reports': 'view_daily_reports',
  'audit-logs': 'view_audit_logs',
  'quality-scores': 'view_quality_scores',
  'user-management': 'manage_users',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ROLE_ORDER.includes(value as UserRole);
}

/** Maps roles stored by earlier builds onto the four-level hierarchy. */
export function migrateLegacyRole(value: string): UserRole {
  switch (value) {
    case 'Super Admin':
    case 'Admin':
    case 'admin':
      return 'admin';
    case 'Manager':
    case 'manager':
      return 'manager';
    case 'Front Office':
    case 'Front Office Manager':
    case 'front_office':
      return 'front_office';
    default:
      // Housekeeping Supervisor, Housekeeping Staff, Maintenance, unknown values.
      return 'housekeeping';
  }
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, route: AppRoute): boolean {
  if (route === 'login') return true;
  const required = ROUTE_PERMISSIONS[route];
  return required ? hasPermission(role, required) : false;
}

/** Landing route after sign-in: housekeeping goes straight to the form, everyone else to the dashboard. */
export function getDefaultRoute(role: UserRole): AppRoute {
  return role === 'housekeeping' ? 'cleanliness-form' : 'dashboard';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role];
}
