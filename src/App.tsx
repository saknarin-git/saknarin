import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevManagerPage } from './pages/DevManagerPage';
import { MemberRegistryPage } from './pages/MemberRegistryPage';
import { LoanManagementPage } from './pages/LoanManagementPage';
import { UserWorkspacePage } from './pages/UserWorkspacePage';
import { useAuth } from './contexts/AuthContext';
import type { UserRole } from './types';

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactElement;
  allowedRoles?: UserRole[];
}) {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return <Navigate to="/workspace" replace />;
  }

  return children;
}

export default function App() {
  const { session } = useAuth();

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <UserWorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/devmanager"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DevManagerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members"
        element={
          <ProtectedRoute allowedRoles={['admin', 'officer']}>
            <MemberRegistryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loans"
        element={
          <ProtectedRoute allowedRoles={['admin', 'officer']}>
            <LoanManagementPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}