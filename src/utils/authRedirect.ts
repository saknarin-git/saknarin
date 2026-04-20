import type { SessionData } from '../types';

export function getDefaultAuthorizedPath(session: SessionData) {
  if (session.user.role === 'dev_admin' && session.permissions.access_devmanager) {
    return '/devmanager';
  }

  if (session.user.role === 'admin' && session.permissions.view_system_dashboard) {
    return '/dashboard';
  }

  if (session.user.role === 'officer' && session.permissions.view_officer_workspace) {
    return '/officer';
  }

  if (session.permissions.view_system_dashboard) {
    return '/dashboard';
  }

  if (session.permissions.view_user_workspace) {
    return '/workspace';
  }

  if (session.permissions.view_officer_workspace) {
    return '/officer';
  }

  if (session.permissions.manage_members) {
    return '/members';
  }

  if (session.permissions.manage_loans) {
    return '/loans';
  }

  if (session.permissions.access_devmanager) {
    return '/devmanager';
  }

  return '/';
}