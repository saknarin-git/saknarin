import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionData } from '../types';
import { readStoredSession, SESSION_STORAGE_EVENT, writeStoredSession } from '../utils/sessionStorage';

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