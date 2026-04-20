import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevManagerPage } from './pages/DevManagerPage';
import { MemberRegistryPage } from './pages/MemberRegistryPage';
import { LoanManagementPage } from './pages/LoanManagementPage';
import { OfficerWorkspacePage } from './pages/OfficerWorkspacePage';
import { UserWorkspacePage } from './pages/UserWorkspacePage';
import { useAuth } from './contexts/AuthContext';
import type { PermissionKey } from './types';
import { getDefaultAuthorizedPath } from './utils/authRedirect';

function ProtectedRoute({
  children,
  requiredPermission,
}: {
  children: ReactElement;
  requiredPermission?: PermissionKey;
}) {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && !session.permissions[requiredPermission]) {
    return <Navigate to={getDefaultAuthorizedPath(session)} replace />;
  }

  return children;
}

export default function App() {
  const { session } = useAuth();
  const defaultPath = session ? getDefaultAuthorizedPath(session) : '/';

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to={defaultPath} replace /> : <LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requiredPermission="view_system_dashboard">
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute requiredPermission="view_user_workspace">
            <UserWorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/officer"
        element={
          <ProtectedRoute requiredPermission="view_officer_workspace">
            <OfficerWorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/devmanager/*"
        element={
          <ProtectedRoute requiredPermission="access_devmanager">
            <DevManagerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members"
        element={
          <ProtectedRoute requiredPermission="manage_members">
            <MemberRegistryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loans"
        element={
          <ProtectedRoute requiredPermission="manage_loans">
            <LoanManagementPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}