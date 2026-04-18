import { apiRequest } from './client';
import type { AppUser, ProfileUpdatePayload } from '../types';

export async function updateProfile(token: string, payload: ProfileUpdatePayload) {
  return apiRequest<{ success: boolean; message: string; data?: AppUser }>(
    'user-profile',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  );
}