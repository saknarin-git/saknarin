import { useAuth } from '../contexts/AuthContext';

export function useAdminGuard() {
  const { session } = useAuth();
  return session?.user.role === 'admin';
}