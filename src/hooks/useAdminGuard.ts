import { useAuth } from '../contexts/AuthContext';

export function useAdminGuard() {
  const { session } = useAuth();
  return Boolean(session?.permissions.access_devmanager);
}