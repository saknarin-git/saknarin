import { apiRequest } from './client';
import type { AdminPanelResponse, AppSettings, ApprovalStatus, UserRole } from '../types';

export async function fetchAdminPanel(token: string) {
  return apiRequest<AdminPanelResponse>('admin-users', { method: 'GET' }, token);
}

export async function updateUserStatus(
  token: string,
  userId: string,
  approvalStatus: ApprovalStatus,
  role: UserRole,
) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-users',
    {
      method: 'PATCH',
      body: JSON.stringify({ userId, approvalStatus, role }),
    },
    token,
  );
}

export async function updateSettings(token: string, settings: AppSettings) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-users',
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
    token,
  );
}