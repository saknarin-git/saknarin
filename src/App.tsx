import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevManagerPage } from './pages/DevManagerPage';
import { MemberRegistryPage } from './pages/MemberRegistryPage';
import { LoanManagementPage } from './pages/LoanManagementPage';
import { useAuth } from './contexts/AuthContext';

function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: ReactElement;
  adminOnly?: boolean;
}) {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && session.user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
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
        path="/devmanager"
        element={
          <ProtectedRoute adminOnly>
            <DevManagerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members"
        element={
          <ProtectedRoute adminOnly>
            <MemberRegistryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loans"
        element={
          <ProtectedRoute adminOnly>
            <LoanManagementPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}