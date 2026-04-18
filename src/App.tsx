import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevManagerPage } from './pages/DevManagerPage';
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
    </Routes>
  );
}