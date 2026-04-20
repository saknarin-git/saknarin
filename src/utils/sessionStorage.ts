import { getDefaultPermissionsForRole } from '../constants/permissions';
import type { SessionData } from '../types';

export const STORAGE_KEY = 'saknarin-session';
export const SESSION_STORAGE_EVENT = 'saknarin-session-updated';

function normalizeStoredSession(raw: string | null): SessionData | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionData> & { user?: SessionData['user'] };

    if (!parsed.user || !parsed.access_token || !parsed.refresh_token) {
      return null;
    }

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      user: parsed.user,
      permissions: parsed.permissions ?? getDefaultPermissionsForRole(parsed.user.role),
    };
  } catch {
    return null;
  }
}

export function readStoredSession(): SessionData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const session = normalizeStoredSession(window.localStorage.getItem(STORAGE_KEY));
  if (!session && window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return session;
}

export function writeStoredSession(session: SessionData | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent<SessionData | null>(SESSION_STORAGE_EVENT, { detail: session }));
}