import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isImpersonating = useAuthStore((s) => s.isImpersonating);
  const endImpersonation = useAuthStore((s) => s.endImpersonation);
  const navigate = useNavigate();

  const handleEndImpersonation = async () => {
    await endImpersonation();
    navigate('/admin?tab=users');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zen-950">
        <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-y-auto">
        {isImpersonating && (
          <div className="bg-warn-500/20 border-b border-warn-500/40 px-4 py-2 flex items-center justify-between">
            <span className="text-sm text-warn-400">
              Viewing as <strong className="text-warn-300">{user.username}</strong> (impersonation mode)
            </span>
            <button onClick={handleEndImpersonation} className="text-xs bg-warn-500/30 hover:bg-warn-500/40 text-warn-300 px-3 py-1 rounded-lg transition-colors">
              End Impersonation
            </button>
          </div>
        )}
        {/* Top bar with notification bell */}
        <div className="flex items-center justify-end px-4 lg:px-8 pt-4 lg:pt-6">
          <NotificationBell />
        </div>
        <main className="flex-1 p-4 lg:px-8 lg:pb-8 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
