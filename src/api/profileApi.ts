import { apiRequest } from './client';
import type { ProfileUpdatePayload, UserProfileDetails } from '../types';

export async function fetchUserProfile(token: string) {
  return apiRequest<{ success: boolean; data: UserProfileDetails }>(
    'user-profile',
    {
      method: 'GET',
    },
    token,
  );
}

export async function updateProfile(token: string, payload: ProfileUpdatePayload) {
  return apiRequest<{ success: boolean; message: string; data?: UserProfileDetails }>(
    'user-profile',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function changePassword(
  token: string,
  payload: { current_password: string; new_password: string },
) {
  return apiRequest<{ success: boolean; message: string }>(
    'user-profile',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}