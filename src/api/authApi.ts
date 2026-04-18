import { apiRequest } from './client';
import type { AuthResult, MemberRecord, RegisterPayload, TitlePrefix } from '../types';

export async function searchMembers(payload: {
  title: TitlePrefix;
  first_name: string;
  last_name: string;
}) {
  return apiRequest<{ success: boolean; data: MemberRecord[] }>('member-search', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerUser(payload: RegisterPayload) {
  return apiRequest<AuthResult>('auth-register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginUser(payload: { username: string; password: string }) {
  return apiRequest<AuthResult>('auth-login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}