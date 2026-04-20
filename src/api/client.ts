import type { AuthResult, SessionData } from '../types';
import { readStoredSession, writeStoredSession } from '../utils/sessionStorage';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://zpknotoujmvkeqeoqgyf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const functionsBaseUrl = `${supabaseUrl}/functions/v1`;

async function refreshAccessToken(currentSession: SessionData) {
  const headers = new Headers();

  if (supabaseAnonKey) {
    headers.set('apikey', supabaseAnonKey);
  }

  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${functionsBaseUrl}/auth-refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
  });

  const payload = await response.json().catch(() => ({ message: 'ต่ออายุการเข้าสู่ระบบไม่สำเร็จ' })) as AuthResult;

  if (!response.ok || !payload.data) {
    writeStoredSession(null);
    return null;
  }

  writeStoredSession(payload.data);
  return payload.data;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const currentSession = readStoredSession();
  let accessToken = currentSession?.access_token ?? token;

  const createHeaders = (activeToken?: string) => {
    const headers = new Headers(options.headers ?? {});

    if (supabaseAnonKey && !headers.has('apikey')) {
      headers.set('apikey', supabaseAnonKey);
    }

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (activeToken) {
      headers.set('Authorization', `Bearer ${activeToken}`);
    }

    return headers;
  };

  let response = await fetch(`${functionsBaseUrl}/${path}`, {
    ...options,
    headers: createHeaders(accessToken),
  });

  if (response.status === 401 && currentSession?.refresh_token) {
    const refreshedSession = await refreshAccessToken(currentSession);
    if (refreshedSession?.access_token) {
      accessToken = refreshedSession.access_token;
      response = await fetch(`${functionsBaseUrl}/${path}`, {
        ...options,
        headers: createHeaders(accessToken),
      });
    }
  }

  const payload = await response.json().catch(() => ({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์' }));

  if (!response.ok) {
    throw new Error(payload.message ?? 'Request failed');
  }

  return payload as T;
}