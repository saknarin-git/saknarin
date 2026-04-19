import type { PermissionKey, PermissionSet, RolePermissionsMatrix, UserRole } from '../types';

export const roleLevels: Record<UserRole, number> = {
  dev_admin: 1,
  admin: 2,
  officer: 3,
  member: 4,
};

export const permissionLabels: Record<PermissionKey, string> = {
  view_system_dashboard: 'เข้าหน้า ภาพรวมระบบ',
  view_user_workspace: 'เข้าหน้า ข้อมูลส่วนตัว',
  view_officer_workspace: 'เข้าหน้า ศูนย์งานเจ้าหน้าที่',
  manage_members: 'เข้าหน้า ทะเบียนสมาชิก',
  manage_loans: 'เข้าหน้า สินเชื่อ',
  access_devmanager: 'เข้าหน้า DevManager',
};

export const roleLabels: Record<UserRole, string> = {
  dev_admin: 'DevManager',
  admin: 'Admin',
  officer: 'เจ้าหน้าที่',
  member: 'สมาชิก',
};

export const roleLevelLabels: Record<UserRole, string> = {
  dev_admin: 'ระดับ 1',
  admin: 'ระดับ 2',
  officer: 'ระดับ 3',
  member: 'ระดับ 4',
};

export const fullPermissionSet: PermissionSet = {
  view_system_dashboard: true,
  view_user_workspace: true,
  view_officer_workspace: true,
  manage_members: true,
  manage_loans: true,
  access_devmanager: true,
};

export const defaultRolePermissions: RolePermissionsMatrix = {
  dev_admin: fullPermissionSet,
  admin: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: true,
    manage_members: true,
    manage_loans: true,
    access_devmanager: true,
  },
  officer: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: true,
    manage_members: true,
    manage_loans: true,
    access_devmanager: false,
  },
  member: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: false,
    manage_members: false,
    manage_loans: false,
    access_devmanager: false,
  },
};

export function getDefaultPermissionsForRole(role: UserRole): PermissionSet {
  return defaultRolePermissions[role];
}

export function canManageRole(actorRole: UserRole, targetCurrentRole: UserRole, nextRole: UserRole) {
  return roleLevels[actorRole] < roleLevels[targetCurrentRole] && roleLevels[actorRole] < roleLevels[nextRole];
}

export function getAssignableRoles(actorRole: UserRole, targetCurrentRole: UserRole) {
  return (Object.keys(roleLevels) as UserRole[]).filter((nextRole) => canManageRole(actorRole, targetCurrentRole, nextRole));
}