import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AccessGuidePage from './pages/AccessGuidePage';
import HomePage from './pages/HomePage';
import MeetingPage from './pages/MeetingPage';
import AdminTemplatesPage from './pages/AdminTemplatesPage';
import AdminUsersPage from './pages/AdminUsersPage';

// Gate the whole app on a resolved Tailscale identity. No identity (accessed
// via raw IP / localhost without header from a non-host device) → guide page.
function IdentityGuard({ children }: { children: ReactNode }) {
  const { loading, identity } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-gray-500">載入中...</div>
      </div>
    );
  }

  if (!identity) {
    return <AccessGuidePage />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <IdentityGuard>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
          <Route path="/meeting/:id" element={<MeetingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </IdentityGuard>
    </AuthProvider>
  );
}

export default App;
