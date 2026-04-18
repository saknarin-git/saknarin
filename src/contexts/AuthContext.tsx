import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionData } from '../types';
import { getDefaultPermissionsForRole } from '../constants/permissions';

interface AuthContextValue {
  session: SessionData | null;
  setSessionData: (session: SessionData | null) => void;
  logout: () => void;
}

const STORAGE_KEY = 'saknarin-session';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): SessionData | null {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionData> & { user?: SessionData['user'] };

    if (!parsed.user || !parsed.access_token || !parsed.refresh_token) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      user: parsed.user,
      permissions: parsed.permissions ?? getDefaultPermissionsForRole(parsed.user.role),
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(readStoredSession);

  const setSessionData = (nextSession: SessionData | null) => {
    setSession(nextSession);

    if (nextSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
  };

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