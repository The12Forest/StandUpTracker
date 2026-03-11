import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './stores/useAuthStore';
import useSocketStore from './stores/useSocketStore';
import useNtpSync from './hooks/useNtpSync';
import useDynamicFavicon from './hooks/useDynamicFavicon';

import ToastContainer from './components/ToastContainer';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TimerPage from './pages/TimerPage';
import DashboardPage from './pages/DashboardPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import SocialPage from './pages/SocialPage';
import GroupsPage from './pages/GroupsPage';
import StreaksPage from './pages/StreaksPage';
import SetupPage from './pages/SetupPage';
import TwoFactorSetupPage from './pages/TwoFactorSetupPage';

function AppShell() {
  const init = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const connect = useSocketStore((s) => s.connect);
  const [setupComplete, setSetupComplete] = useState(null);

  useNtpSync();
  useDynamicFavicon();

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data) => setSetupComplete(data.setupComplete))
      .catch(() => setSetupComplete(true)); // assume complete if check fails
  }, []);

  useEffect(() => { if (setupComplete) init(); }, [init, setupComplete]);
  useEffect(() => { if (user) connect(); }, [user, connect]);

  if (setupComplete === null) {
    return <div className="min-h-screen bg-zen-950 flex items-center justify-center text-zen-500">Loading...</div>;
  }

  if (!setupComplete) {
    return (
      <>
        <ToastContainer />
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/setup" element={<Navigate to="/app" replace />} />
        {user?.needs2faSetup ? (
          <>
            <Route path="/2fa-setup" element={<TwoFactorSetupPage />} />
            <Route path="*" element={<Navigate to="/2fa-setup" replace />} />
          </>
        ) : (
          <>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<TimerPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/friends" element={<SocialPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/streaks" element={<StreaksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </>
        )}
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
