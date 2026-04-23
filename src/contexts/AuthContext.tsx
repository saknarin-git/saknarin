import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionData } from '../types';
import { readStoredSession, SESSION_STORAGE_EVENT, writeStoredSession } from '../utils/sessionStorage';

function parseSessionExpiry(accessToken: string) {
  const parts = accessToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(padded)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: SessionData | null;
  setSessionData: (session: SessionData | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(readStoredSession);

  const setSessionData = (nextSession: SessionData | null) => {
    setSession(nextSession);
    writeStoredSession(nextSession);
  };

  useEffect(() => {
    const handleSessionUpdate = (event: Event) => {
      const nextSession = (event as CustomEvent<SessionData | null>).detail ?? readStoredSession();
      setSession(nextSession);
    };

    window.addEventListener(SESSION_STORAGE_EVENT, handleSessionUpdate as EventListener);
    return () => window.removeEventListener(SESSION_STORAGE_EVENT, handleSessionUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      return undefined;
    }

    const expiryTime = parseSessionExpiry(session.access_token);
    if (!expiryTime) {
      return undefined;
    }

    const timeoutMs = expiryTime - Date.now();
    if (timeoutMs <= 0) {
      setSessionData(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSessionData(null);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      setSessionData,
      logout: () => setSessionData(null),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}