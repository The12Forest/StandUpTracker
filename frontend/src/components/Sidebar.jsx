import { NavLink, useNavigate } from 'react-router-dom';
import { Timer, BarChart3, Trophy, Settings, Shield, LogOut, Menu, X, Users, UsersRound, Flame, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import useAuthStore from '../stores/useAuthStore';
import useSocketStore from '../stores/useSocketStore';

const NAV_ITEMS = [
  { to: '/app', icon: Timer, label: 'Timer' },
  { to: '/dashboard', icon: BarChart3, label: 'Stats' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/groups', icon: UsersRound, label: 'Groups' },
  { to: '/streaks', icon: Flame, label: 'Streaks' },
  { to: '/scheduler', icon: CalendarDays, label: 'Scheduler' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const disconnect = useSocketStore((s) => s.disconnect);
  const connected = useSocketStore((s) => s.connected);
  const navigate = useNavigate();

  const isAdmin = user && ['manager', 'admin', 'super_admin'].includes(user.role);

  const handleLogout = () => {
    disconnect();
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm
     ${isActive
       ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
       : 'text-zen-400 hover:text-zen-200 hover:bg-zen-800/40'}`;

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-zen-900/90 backdrop-blur-xl border border-zen-700/40 text-zen-300"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay on mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-zen-900/60 backdrop-blur-2xl
                    border-r border-zen-700/30 flex flex-col z-40 transition-transform duration-300
                    ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-zen-700/30">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => { navigate('/app'); setOpen(false); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { navigate('/app'); setOpen(false); } }}
          >
            <div className="w-9 h-9 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <Timer size={18} className="text-accent-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zen-100">StandUpTracker</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent-500' : 'bg-danger-500'}`} />
                <span className="text-[10px] text-zen-500">{connected ? 'Synced' : 'Offline'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setOpen(false)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
              <Shield size={18} />
              Admin
            </NavLink>
          )}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-zen-700/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 text-xs font-bold">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zen-200 truncate">{user?.username}</p>
              <p className="text-[10px] text-zen-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full flex items-center justify-center gap-2 text-sm">
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
