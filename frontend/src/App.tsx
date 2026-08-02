import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import GroupDetailPage from './GroupDetailPage';
import FriendDetailPage from './FriendDetailPage';
import HelpPage from './HelpPage';
import AccountSettingsPage from './AccountSettingsPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import VerifyEmailPage from './VerifyEmailPage';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { SyncProvider } from './contexts/SyncContext';
import { AppDataProvider } from './contexts/AppDataContext';
import AppShell from './layouts/AppShell';
import OverviewPage from './routes/OverviewPage';
import GroupsPage from './routes/GroupsPage';
import PeoplePage from './routes/PeoplePage';
import ActivityPage from './routes/ActivityPage';
import SyncStatusBar from './components/SyncStatusBar';

const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-sw-bg">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sw-accent"></div>
        <p className="mt-4 text-sw-muted">Loading...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;

  return element;
};

/**
 * Wraps the redesigned shell in the auth guard and the shared data provider.
 * The provider sits inside the guard so it only fetches once there is a user.
 */
const ShellRoute = () => (
  <ProtectedRoute
    element={
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    }
  />
);

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <Router>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
              <Route path="/verify-email/:token" element={<VerifyEmailPage />} />

              {/*
                * Protected routes render inside the shell, which stays mounted
                * across navigation — the rail and tab bar never unmount.
                */}
              <Route element={<ShellRoute />}>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/groups/:groupId" element={<GroupDetailPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/friends/:friendId" element={<FriendDetailPage />} />
                <Route path="/activity" element={<ActivityPage />} />
              </Route>

              {/* Full-page protected routes, outside the shell */}
              <Route path="/account" element={<ProtectedRoute element={<AccountSettingsPage />} />} />
              <Route path="/help" element={<ProtectedRoute element={<HelpPage />} />} />

              {/* Public share link */}
              <Route path="/share/:shareLinkId" element={<GroupDetailPage />} />
            </Routes>
            <SyncStatusBar />
          </Router>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
