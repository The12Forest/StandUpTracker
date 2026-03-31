import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, Users, Activity, Server, ScrollText, Settings,
  Search, RefreshCw, Eye, EyeOff, Sliders, UserCheck, Calendar,
  Trash2, Lock, Unlock, KeyRound, MailCheck, Ban, HardDrive,
  Cpu, Clock, Database, TrendingUp, Globe, MailX, UsersRound, Mail,
  Brain, Info, BarChart3, Heart, UserPlus, Flame, Wifi, Zap, PenLine
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { api } from '../lib/api';
import { BentoCard, BentoGrid, StatCard } from '../components/BentoCard';
import useToastStore from '../stores/useToastStore';
import useAuthStore from '../stores/useAuthStore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

const TABS = [
  { id: 'overview', icon: Activity, label: 'Overview' },
  { id: 'statistics', icon: BarChart3, label: 'Statistics' },
  { id: 'users', icon: Users, label: 'Users' },
  { id: 'logs', icon: ScrollText, label: 'Logs' },
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'config', icon: Sliders, label: 'Audit Log' },
];

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const setTab = (id) => setSearchParams({ tab: id }, { replace: true });
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-zen-100 flex items-center gap-2">
        <Shield size={20} className="text-accent-400" />
        Admin Panel
      </h2>
      <div className="flex gap-1 bg-zen-900/60 border border-zen-700/40 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap
              ${tab === t.id ? 'bg-accent-500/20 text-accent-400' : 'text-zen-500 hover:text-zen-300'}`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'statistics' && <StatisticsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => { api('/api/admin/stats').then(setStats).catch(() => {}); }, []);
  useEffect(() => {
    loadStats();
    const id = setInterval(loadStats, 30000);
    return () => clearInterval(id);
  }, [loadStats]);

  if (!stats) return <div className="text-zen-500">Loading...</div>;

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(1)} ${units[i]}`;
  };

  const formatUptime = (secs) => {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatHours = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* System Health */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2"><Server size={14} /> System Health</h3>
        <BentoGrid>
          <StatCard label="CPU Usage" value={`${stats.server?.cpuPercent || 0}%`} icon={Cpu}
            sub={`5m avg: ${stats.server?.cpuAvg5m || 0}% · ${stats.server?.cpus || 0} cores`} />
          <StatCard label="System RAM" value={`${pct(stats.server?.usedRAM, stats.server?.totalRAM)}%`} icon={HardDrive}
            sub={`${formatBytes(stats.server?.usedRAM)} / ${formatBytes(stats.server?.totalRAM)}`} />
          <StatCard label="Disk Usage" value={stats.server?.diskTotal ? `${pct(stats.server.diskUsed, stats.server.diskTotal)}%` : 'N/A'} icon={Database}
            sub={stats.server?.diskTotal ? `${formatBytes(stats.server.diskUsed)} / ${formatBytes(stats.server.diskTotal)}` : 'Unavailable'} />
          <StatCard label="Uptime" value={formatUptime(stats.server?.uptime || 0)} icon={Clock}
            sub={`Node ${stats.server?.nodeVersion || ''} · ${stats.server?.platform || ''}`} />
          <StatCard label="Process Memory" value={formatBytes(stats.server?.memoryRSS || 0)} icon={Zap}
            sub={`Heap: ${formatBytes(stats.server?.memoryHeap || 0)} / ${formatBytes(stats.server?.memoryHeapTotal || 0)}`} />
          <StatCard label="WebSocket Connections" value={stats.server?.wsConnections || 0} icon={Wifi}
            sub={`${stats.server?.onlineUsers || 0} unique users online`} />
          <StatCard label="Database Size" value={formatBytes(stats.server?.dbSizeBytes || 0)} icon={Database}
            sub={`${stats.logs?.total || 0} log entries`} />
        </BentoGrid>
      </div>

      {/* Application Activity */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2"><Activity size={14} /> Application Activity</h3>
        <BentoGrid>
          <StatCard label="Total Sessions" value={stats.tracking?.totalSessions || 0} icon={TrendingUp}
            sub={`${stats.tracking?.totalRecords || 0} tracking records`} />
          <StatCard label="Total Standing Time" value={formatHours(stats.tracking?.totalSeconds || 0)} icon={Clock}
            sub="Across all users, all time" />
          <StatCard label="Avg Daily / User" value={`${stats.tracking?.avgDailyMinutesAllUsers || 0} min`} icon={Calendar}
            sub={`${stats.tracking?.activeToday || 0} users active today`} />
          <StatCard label="Sessions Today" value={stats.tracking?.sessionsStartedToday || 0} icon={Activity}
            sub={`${stats.tracking?.sessionsCompletedToday || 0} completed`} />
          <StatCard label="AI Advice Requests" value={stats.tracking?.aiRequestsTotal || 0} icon={Brain}
            sub={`${stats.tracking?.aiRequestsToday || 0} today`} />
        </BentoGrid>
      </div>

      {/* User Engagement */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2"><Users size={14} /> User Engagement</h3>
        <BentoGrid>
          <StatCard label="Total Users" value={stats.users?.total || 0} icon={Users}
            sub={`${stats.users?.active || 0} active · ${stats.users?.blocked || 0} blocked`} />
          <StatCard label="Active Today" value={stats.tracking?.activeToday || 0} icon={Activity}
            sub={`${stats.tracking?.activeYesterday || 0} yesterday · ${stats.users?.activeThisWeek || 0} this week`} />
          <StatCard label="New Registrations" value={stats.users?.registrationsThisWeek || 0} icon={UserPlus}
            sub={`This week · ${stats.users?.registrationsThisMonth || 0} this month`} />
          <StatCard label="2FA Enabled" value={stats.users?.twoFaTotal || 0} icon={Shield}
            sub={`${pct(stats.users?.twoFaTotal, stats.users?.total)}% · ${stats.users?.totpEnabled || 0} TOTP / ${stats.users?.email2faEnabled || 0} Email`} />
          <StatCard label="Verified Emails" value={stats.users?.verified || 0} icon={MailCheck}
            sub={`${pct(stats.users?.verified, stats.users?.total)}% of all users`} />
          <StatCard label="Online Now" value={stats.server?.onlineUsers || 0} icon={Globe}
            sub={`${stats.server?.wsConnections || 0} connections`} />
        </BentoGrid>
        {/* Registration sparkline */}
        {stats.users?.regSparkline?.length > 0 && (
          <BentoCard className="mt-4">
            <p className="text-xs text-zen-400 mb-3">New Registrations (Last 7 Days)</p>
            <div className="flex items-end gap-1 h-16">
              {stats.users.regSparkline.map((d) => {
                const max = Math.max(...stats.users.regSparkline.map(x => x.count), 1);
                const h = Math.max(4, (d.count / max) * 100);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-accent-500/60 rounded-sm" style={{ height: `${h}%` }} title={`${d.date}: ${d.count}`} />
                    <span className="text-[8px] text-zen-600">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </BentoCard>
        )}
      </div>

      {/* Streak Statistics */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2"><Flame size={14} /> Streak Statistics</h3>
        <BentoGrid>
          <StatCard label="Active Personal Streaks" value={stats.streaks?.activePersonal || 0} icon={Flame}
            sub={`Avg length: ${stats.streaks?.avgLength || 0} days`} />
          <StatCard label="Longest Personal Streak" value={stats.streaks?.longestPersonal ? `${stats.streaks.longestPersonal.days}d` : '—'} icon={TrendingUp}
            sub={stats.streaks?.longestPersonal?.username || 'No streaks yet'} />
          <StatCard label="Active Friend Streaks" value={stats.streaks?.activeFriend || 0} icon={Heart} />
          <StatCard label="Active Group Streaks" value={stats.streaks?.activeGroup || 0} icon={UsersRound} />
        </BentoGrid>
      </div>

      {/* Top Users */}
      {stats.topUsers?.length > 0 && (
        <BentoCard>
          <p className="text-sm text-zen-400 mb-3">Top Users</p>
          <div className="space-y-2">
            {stats.topUsers.map((u, i) => (
              <div key={u.userId} className="flex items-center gap-3 text-sm">
                <span className="text-zen-500 w-5">{i + 1}.</span>
                <span className="text-zen-200 flex-1">{u.username}</span>
                <span className="text-zen-400 font-mono">{Math.round((u.totalStandingSeconds || 0) / 3600)}h</span>
                <span className="text-zen-500 text-xs">Lv.{u.level}</span>
              </div>
            ))}
          </div>
        </BentoCard>
      )}
    </div>
  );
}

function StatisticsTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/admin/stats/extended').then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="text-zen-500">Loading statistics...</div>;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a2e' } },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(100,116,139,0.1)' }, beginAtZero: true },
    },
  };

  const registrationChart = {
    labels: (data.users?.registrationsByMonth || []).map(r => r._id),
    datasets: [{
      data: (data.users?.registrationsByMonth || []).map(r => r.count),
      backgroundColor: 'rgba(54, 209, 196, 0.6)',
      borderRadius: 4,
    }],
  };

  const groupChart = {
    labels: (data.groups?.groupsByMonth || []).map(r => r._id),
    datasets: [{
      data: (data.groups?.groupsByMonth || []).map(r => r.count),
      backgroundColor: 'rgba(91, 134, 229, 0.6)',
      borderRadius: 4,
    }],
  };

  return (
    <div className="space-y-8">
      {/* Users Section */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <Users size={14} /> Users
        </h3>
        <BentoGrid>
          <StatCard label="Total Registered" value={data.users?.total || 0} icon={Users} />
          <StatCard label="Active Accounts" value={data.users?.active || 0} icon={Activity}
            sub={`${data.users?.inactive || 0} inactive`} />
          <StatCard label="Verified Emails" value={data.users?.verifiedEmails || 0} icon={MailCheck}
            sub={`${data.users?.unverifiedEmails || 0} unverified`} />
          <StatCard label="Active Last 24h" value={data.users?.loginFrequency?.last24h || 0} icon={Clock}
            sub={`7d: ${data.users?.loginFrequency?.last7d || 0} / 30d: ${data.users?.loginFrequency?.last30d || 0}`} />
        </BentoGrid>
        {(data.users?.registrationsByMonth || []).length > 0 && (
          <BentoCard className="mt-4">
            <p className="text-xs text-zen-400 mb-3">New Registrations Over Time</p>
            <div style={{ height: 200 }}>
              <Bar data={registrationChart} options={chartOptions} />
            </div>
          </BentoCard>
        )}
      </div>

      {/* Friends Section */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <Heart size={14} /> Friends
        </h3>
        <BentoGrid>
          <StatCard label="Total Friendships" value={data.friends?.totalFriendships || 0} icon={Heart} />
          <StatCard label="Avg Friends/User" value={data.friends?.avgFriendsPerUser || 0} icon={Users} />
          <StatCard label="Pending Requests" value={data.friends?.pendingRequests || 0} icon={UserPlus} />
          <StatCard label="Acceptance Rate" value={`${data.friends?.acceptanceRate || 0}%`} icon={UserCheck} />
        </BentoGrid>
        {(data.friends?.topUsersByFriendCount || []).length > 0 && (
          <BentoCard className="mt-4">
            <p className="text-xs text-zen-400 mb-3">Top Users by Friend Count</p>
            <div className="space-y-2">
              {data.friends.topUsersByFriendCount.map((u, i) => (
                <div key={u.userId} className="flex items-center gap-3 text-sm">
                  <span className="text-zen-500 w-5">{i + 1}.</span>
                  <span className="text-zen-200 flex-1">{u.username}</span>
                  <span className="text-zen-400 font-mono">{u.friendCount} friends</span>
                </div>
              ))}
            </div>
          </BentoCard>
        )}
      </div>

      {/* Groups Section */}
      <div>
        <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <UsersRound size={14} /> Groups
        </h3>
        <BentoGrid>
          <StatCard label="Total Groups" value={data.groups?.total || 0} icon={UsersRound} />
          <StatCard label="Avg Group Size" value={data.groups?.avgGroupSize || 0} icon={Users} />
          <StatCard label="Active Groups" value={data.groups?.active || 0} icon={Activity}
            sub={`${data.groups?.inactive || 0} inactive`} />
        </BentoGrid>
        {(data.groups?.largestGroups || []).length > 0 && (
          <BentoCard className="mt-4">
            <p className="text-xs text-zen-400 mb-3">Largest Groups</p>
            <div className="space-y-2">
              {data.groups.largestGroups.map((g, i) => (
                <div key={g.groupId} className="flex items-center gap-3 text-sm">
                  <span className="text-zen-500 w-5">{i + 1}.</span>
                  <span className="text-zen-200 flex-1">{g.name}</span>
                  <span className="text-zen-400 font-mono">{g.memberCount} members</span>
                </div>
              ))}
            </div>
          </BentoCard>
        )}
        {(data.groups?.groupsByMonth || []).length > 0 && (
          <BentoCard className="mt-4">
            <p className="text-xs text-zen-400 mb-3">Group Creation Over Time</p>
            <div style={{ height: 200 }}>
              <Bar data={groupChart} options={chartOptions} />
            </div>
          </BentoCard>
        )}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [passwordModal, setPasswordModal] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [usernameModal, setUsernameModal] = useState(null); // { userId, username }
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [viewDeleted, setViewDeleted] = useState(false);
  const toast = useToastStore();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const startImpersonation = useAuthStore((s) => s.startImpersonation);

  const fetchUsers = useCallback(() => {
    api(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}&deleted=${viewDeleted}`)
      .then((data) => { setUsers(data.users || []); setTotal(data.total || 0); })
      .catch(() => {});
  }, [page, search, viewDeleted]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateRole = async (userId, role, username) => {
    if (role === 'super_admin') {
      if (!confirm(`Promote ${username} to Super Admin? They will have full administrative access including the ability to promote other users.`)) return;
    }
    try {
      await api(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ role }) });
      toast.success('Role updated');
      fetchUsers();
    } catch (err) { toast.error(err.data?.error || err.message); }
  };

  const handleImpersonate = async (userId) => {
    try {
      await startImpersonation(userId);
      toast.warn('Impersonation started');
    } catch (err) { toast.error(err.message); }
  };

  const handleVerifyEmail = async (userId) => {
    try {
      await api(`/api/admin/users/${userId}/verify-email`, { method: 'PUT' });
      toast.success('Email verified');
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleSetPassword = async () => {
    if (!passwordModal || newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await api(`/api/admin/users/${passwordModal}/password`, { method: 'PUT', body: JSON.stringify({ newPassword: newPw }) });
      toast.success('Password updated');
      setPasswordModal(null);
      setNewPw('');
    } catch (err) { toast.error(err.message); }
  };

  const handleSetUsername = async () => {
    if (!usernameModal) return;
    const trimmed = newUsername.trim();
    if (trimmed.length < 3) { setUsernameError('Must be at least 3 characters'); return; }
    if (trimmed.length > 32) { setUsernameError('Must be at most 32 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Only letters, numbers, and underscores'); return; }
    setUsernameError('');
    try {
      await api(`/api/admin/users/${usernameModal.userId}/username`, { method: 'PUT', body: JSON.stringify({ username: trimmed }) });
      toast.success('Username updated');
      setUsernameModal(null);
      setNewUsername('');
      fetchUsers();
    } catch (err) { setUsernameError(err.data?.error || err.message); }
  };

  const handleToggleCanChangeUsername = async (userId, current) => {
    try {
      await api(`/api/admin/users/${userId}/can-change-username`, { method: 'PUT', body: JSON.stringify({ canChangeUsername: !current }) });
      toast.success(`Username changes ${!current ? 'enabled' : 'disabled'}`);
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`Delete user "${username}"? This will soft-delete the account.`)) return;
    try {
      await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      toast.success('User deleted');
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleForceReverify = async (userId, username) => {
    if (!confirm(`Force ${username} to re-verify their email?`)) return;
    try {
      await api(`/api/admin/users/${userId}/force-reverify`, { method: 'POST' });
      toast.success('User must re-verify their email');
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handlePermanentDelete = async (userId, username) => {
    if (!confirm(`PERMANENTLY delete "${username}"? This will remove ALL data for this user and cannot be undone.`)) return;
    if (!confirm(`Are you absolutely sure? This action is IRREVERSIBLE.`)) return;
    try {
      await api(`/api/admin/users/${userId}/permanent`, { method: 'DELETE' });
      toast.success('User permanently deleted');
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleBlockUser = async (userId, currentlyActive) => {
    try {
      await api(`/api/admin/users/${userId}/block`, {
        method: 'PUT',
        body: JSON.stringify({ blocked: currentlyActive }),
      });
      toast.success(currentlyActive ? 'User deactivated' : 'User reactivated');
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const bulkAction = async (action, params = {}) => {
    if (selected.size === 0) { toast.warn('No users selected'); return; }
    try {
      const data = await api('/api/admin/users/bulk', {
        method: 'POST',
        body: JSON.stringify({ userIds: [...selected], action, params }),
      });
      toast.success(data.message);
      setSelected(new Set());
      fetchUsers();
    } catch (err) { toast.error(err.message); }
  };

  const toggleSelect = (userId) => {
    const next = new Set(selected);
    next.has(userId) ? next.delete(userId) : next.add(userId);
    setSelected(next);
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="flex bg-zen-900/60 border border-zen-700/40 rounded-lg p-0.5">
          <button onClick={() => { setViewDeleted(false); setPage(1); setSelected(new Set()); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${!viewDeleted ? 'bg-accent-500/20 text-accent-400' : 'text-zen-500 hover:text-zen-300'}`}>
            Active
          </button>
          <button onClick={() => { setViewDeleted(true); setPage(1); setSelected(new Set()); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewDeleted ? 'bg-danger-500/20 text-danger-400' : 'text-zen-500 hover:text-zen-300'}`}>
            Deleted
          </button>
        </div>
        <div className="flex items-center gap-2 glass-input flex-1 !py-0">
          <Search size={14} className="text-zen-500 shrink-0" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent border-none outline-none flex-1 text-zen-100 placeholder:text-zen-500 py-3 text-sm"
            placeholder={viewDeleted ? 'Search deleted users...' : 'Search users...'} />
        </div>
        <button onClick={fetchUsers} className="btn-ghost"><RefreshCw size={14} /></button>
      </div>

      {isSuperAdmin && !viewDeleted && selected.size > 0 && (
        <div className="flex gap-2 items-center text-xs flex-wrap">
          <span className="text-zen-400">{selected.size} selected:</span>
          <button onClick={() => bulkAction('activate')} className="btn-ghost text-xs text-accent-400">Activate</button>
          <button onClick={() => bulkAction('deactivate')} className="btn-ghost text-xs text-warn-400">Deactivate</button>
          <button onClick={() => bulkAction('setRole', { role: 'user' })} className="btn-ghost text-xs">Set User</button>
          <button onClick={() => bulkAction('delete')} className="btn-ghost text-xs text-danger-400">Delete</button>
        </div>
      )}

      {/* Set Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPasswordModal(null)}>
          <div className="glass-card rounded-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zen-200">Set New Password</h3>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="glass-input w-full"
              placeholder="New password (min 8 chars)"
              autoComplete="new-password"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPasswordModal(null)} className="btn-ghost text-xs">Cancel</button>
              <button onClick={handleSetPassword} className="btn-accent text-xs">Set Password</button>
            </div>
          </div>
        </div>
      )}

      {/* Set Username Modal */}
      {usernameModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setUsernameModal(null); setUsernameError(''); }}>
          <div className="glass-card rounded-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zen-200">Change Username for {usernameModal.username}</h3>
            <input
              value={newUsername}
              onChange={(e) => { setNewUsername(e.target.value); setUsernameError(''); }}
              className="glass-input w-full"
              placeholder="New username (3–32 chars)"
              maxLength={32}
            />
            {usernameError && <p className="text-xs text-danger-400">{usernameError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setUsernameModal(null); setUsernameError(''); }} className="btn-ghost text-xs">Cancel</button>
              <button onClick={handleSetUsername} className="btn-accent text-xs">Change Username</button>
            </div>
          </div>
        </div>
      )}

      <BentoCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zen-700/30">
                {isSuperAdmin && !viewDeleted && <th className="w-10 px-3"><input type="checkbox" onChange={(e) => { setSelected(e.target.checked ? new Set(users.map(u => u.userId)) : new Set()); }} className="accent-accent-500" /></th>}
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3">User</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 hidden md:table-cell">Email</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3">Role</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3">Status</th>
                {viewDeleted && <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 hidden lg:table-cell">Deleted</th>}
                <th className="text-right text-xs text-zen-500 font-normal px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-b border-zen-700/20 hover:bg-zen-800/30 transition-colors">
                  {isSuperAdmin && !viewDeleted && <td className="px-3"><input type="checkbox" checked={selected.has(u.userId)} onChange={() => toggleSelect(u.userId)} className="accent-accent-500" /></td>}
                  <td className="px-4 py-3">
                    <div className="text-sm text-zen-200">{u.username}</div>
                    {viewDeleted && u.originalUsername && (
                      <div className="text-[10px] text-zen-500">was: {u.originalUsername}</div>
                    )}
                    <div className="text-[10px] text-zen-600 font-mono">{u.userId?.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="text-sm text-zen-400">{u.email}</div>
                    {viewDeleted && u.originalEmail && (
                      <div className="text-[10px] text-zen-500">was: {u.originalEmail}</div>
                    )}
                    {!viewDeleted && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {u.emailVerified ? (
                          <span className="text-[10px] text-accent-400">✓ Verified</span>
                        ) : (
                          <span className="text-[10px] text-warn-400">✗ Unverified</span>
                        )}
                        {u.totpEnabled && <span className="text-[10px] text-blue-400 ml-1">TOTP</span>}
                        {u.email2faEnabled && <span className="text-[10px] text-blue-400 ml-1">Email2FA</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {viewDeleted ? (
                      <span className="text-xs text-zen-500">{u.role}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select value={u.role} onChange={(e) => updateRole(u.userId, e.target.value, u.username)}
                          className="bg-zen-800 border border-zen-700/50 rounded-lg text-xs text-zen-300 px-2 py-1"
                          disabled={!isSuperAdmin || u.userId === currentUser?.userId}>
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                          {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                        </select>
                        {u.userId === currentUser?.userId && <span className="text-[10px] text-zen-600">(you)</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {viewDeleted ? (
                      <span className="text-xs px-2 py-1 rounded-lg bg-danger-500/10 text-danger-400">Deleted</span>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-lg ${u.active ? 'bg-accent-500/10 text-accent-400' : 'bg-danger-500/10 text-danger-400'}`}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    )}
                  </td>
                  {viewDeleted && (
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-zen-500">{u.deletedAt ? new Date(u.deletedAt).toLocaleDateString() : '—'}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {viewDeleted ? (
                        isSuperAdmin && (
                          <button onClick={() => handlePermanentDelete(u.userId, u.originalUsername || u.username)} className="text-[10px] px-1.5 py-0.5 rounded text-danger-400 hover:bg-danger-500/10 flex items-center gap-0.5" title="Permanently Delete">
                            <Trash2 size={11} /> Permanently Delete
                          </button>
                        )
                      ) : (
                        <>
                          <button onClick={() => navigate(`/admin/user/${u.userId}/times`)} className="text-[10px] px-1.5 py-0.5 rounded text-accent-400 hover:bg-accent-500/10 flex items-center gap-0.5" title="Edit Daily Times">
                            <Clock size={11} /> Edit Time
                          </button>
                          {isSuperAdmin && u.role !== 'super_admin' && (
                            <>
                              <button onClick={() => handleImpersonate(u.userId)} className="text-[10px] px-1.5 py-0.5 rounded text-warn-400 hover:bg-warn-500/10 flex items-center gap-0.5" title="Impersonate">
                                <Eye size={11} /> View As
                              </button>
                              <button onClick={() => handleBlockUser(u.userId, u.active)} className="text-[10px] px-1.5 py-0.5 rounded text-zen-500 hover:bg-zen-700/50 flex items-center gap-0.5" title={u.active ? 'Deactivate' : 'Reactivate'}>
                                {u.active ? <><Ban size={11} /> Deactivate</> : <><Unlock size={11} /> Reactivate</>}
                              </button>
                              {!u.emailVerified && (
                                <button onClick={() => handleVerifyEmail(u.userId)} className="text-[10px] px-1.5 py-0.5 rounded text-accent-400 hover:bg-accent-500/10 flex items-center gap-0.5" title="Verify Email">
                                  <MailCheck size={11} /> Verify
                                </button>
                              )}
                              {u.emailVerified && (
                                <button onClick={() => handleForceReverify(u.userId, u.username)} className="text-[10px] px-1.5 py-0.5 rounded text-warn-400 hover:bg-warn-500/10 flex items-center gap-0.5" title="Force Re-verify">
                                  <MailX size={11} /> Re-verify
                                </button>
                              )}
                              <button onClick={() => { setUsernameModal({ userId: u.userId, username: u.username }); setNewUsername(''); }} className="text-[10px] px-1.5 py-0.5 rounded text-zen-500 hover:bg-zen-700/50 flex items-center gap-0.5" title="Change Username">
                                <PenLine size={11} /> Username
                              </button>
                              <button onClick={() => handleToggleCanChangeUsername(u.userId, u.canChangeUsername !== false)} className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${u.canChangeUsername !== false ? 'text-accent-400 hover:bg-accent-500/10' : 'text-danger-400 hover:bg-danger-500/10'}`} title={u.canChangeUsername !== false ? 'Deny self-rename' : 'Allow self-rename'}>
                                {u.canChangeUsername !== false ? <><Unlock size={11} /> Rename: On</> : <><Lock size={11} /> Rename: Off</>}
                              </button>
                              <button onClick={() => setPasswordModal(u.userId)} className="text-[10px] px-1.5 py-0.5 rounded text-zen-500 hover:bg-zen-700/50 flex items-center gap-0.5" title="Set Password">
                                <KeyRound size={11} /> Password
                              </button>
                              <button onClick={async () => {
                                if (!confirm(`Revoke all sessions for ${u.username}? They will be signed out immediately.`)) return;
                                try {
                                  const result = await api(`/api/admin/sessions/revoke/${u.userId}`, { method: 'POST' });
                                  toast.success(result.message || 'Sessions revoked');
                                } catch (err) { toast.error(err.message); }
                              }} className="text-[10px] px-1.5 py-0.5 rounded text-warn-400 hover:bg-warn-500/10 flex items-center gap-0.5" title="Revoke all sessions for this user">
                                <Lock size={11} /> Revoke Sessions
                              </button>
                              <button onClick={() => handleDeleteUser(u.userId, u.username)} className="text-[10px] px-1.5 py-0.5 rounded text-danger-400 hover:bg-danger-500/10 flex items-center gap-0.5" title="Delete">
                                <Trash2 size={11} /> Delete
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BentoCard>

      <div className="flex justify-between items-center text-xs text-zen-500">
        <span>{total} users total</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-ghost text-xs">Prev</button>
          <span className="px-2 py-1">Page {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={users.length < 20} className="btn-ghost text-xs">Next</button>
        </div>
      </div>
    </div>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState('');

  useEffect(() => {
    const params = level ? `?level=${level}` : '';
    api(`/api/admin/logs${params}`)
      .then((data) => setLogs(data.logs || []))
      .catch(() => {});
  }, [level]);

  const levelColor = {
    INFO: 'text-blue-400',
    WARN: 'text-warn-400',
    ERROR: 'text-danger-400',
    DEBUG: 'text-zen-500',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map((l) => (
          <button key={l} onClick={() => setLevel(l)}
            className={`px-3 py-1 rounded-lg text-xs transition-all ${level === l ? 'bg-accent-500/20 text-accent-400' : 'text-zen-500 hover:text-zen-300'}`}>
            {l || 'All'}
          </button>
        ))}
      </div>
      <BentoCard className="max-h-[600px] overflow-y-auto font-mono text-xs space-y-1 p-4">
        {logs.length === 0 && <p className="text-zen-500">No logs</p>}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 py-1 border-b border-zen-800/50">
            <span className="text-zen-600 shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
            <span className={`shrink-0 uppercase w-12 ${levelColor[log.level] || 'text-zen-500'}`}>{log.level}</span>
            <span className="text-zen-300">{log.message}</span>
          </div>
        ))}
      </BentoCard>
    </div>
  );
}

const SECTION_LABELS = {
  enforcement: { label: 'User Defaults & Enforcement', icon: Lock, description: 'Master daily goal, enforced settings, and mandatory 2FA' },
  server: { label: 'Server Configuration', icon: Server, description: 'Core server settings like protocol, port, and application name' },
  security: { label: 'Security / JWT', icon: Shield, description: 'JWT signing secret, token expiry, and session cookie settings' },
  client: { label: 'Client / Interface Settings', icon: Globe, description: 'Configure defaults for the user-facing application' },
  mail: { label: 'Mail Server Settings', icon: Settings, description: 'SMTP configuration for email delivery' },
  auth: { label: 'Authentication & Security', icon: Shield, description: 'Registration, verification, and access control' },
  social: { label: 'Social / Features', icon: Users, description: 'Friend requests, streaks, and social features' },
  groups: { label: 'Groups', icon: UsersRound, description: 'Group creation, limits, and streak settings' },
  emailAdmin: { label: 'Email Administration', icon: Mail, description: 'Force re-verification and email admin actions' },
  ai: { label: 'AI / Ollama', icon: Brain, description: 'Configure the Ollama AI endpoint, model, and feature toggle' },
  push: { label: 'Push Notifications', icon: Wifi, description: 'VAPID keys for Web Push notifications' },
  scheduler: { label: 'Scheduler', icon: Calendar, description: 'Forgotten checkout detection and scheduler display settings' },
  thresholds: { label: 'Activity Thresholds', icon: Activity, description: 'Minimum activity requirements for statistics inclusion' },
  reporting: { label: 'Reporting', icon: Flame, description: 'Timer abuse reporting: threshold, cooldown, and self-report settings' },
  logging: { label: 'Logging', icon: ScrollText, description: 'Log levels and retention policies' },
  general: { label: 'Other Settings', icon: Sliders, description: 'Miscellaneous settings' },
};

function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [ollamaModels, setOllamaModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const toast = useToastStore();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const SENSITIVE_KEYS = new Set(['smtpPass', 'jwtSecret', 'vapidPrivateKey']);
  const HIDDEN_KEYS = new Set(['defaultTheme']);
  const [generatingVapid, setGeneratingVapid] = useState(false);

  const loadSettings = useCallback(() => {
    api('/api/admin/settings').then(setSettings).catch(() => {});
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  const fetchOllamaModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const data = await api('/api/ai/models');
      setOllamaModels(data.models || []);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch models');
      setOllamaModels([]);
    }
    setLoadingModels(false);
  }, [toast]);

  // Auto-fetch Ollama models when settings load and endpoint exists
  useEffect(() => {
    if (settings.ollamaEndpoint?.value) fetchOllamaModels();
  }, [settings.ollamaEndpoint?.value, fetchOllamaModels]);

  const saveSetting = async (key, value) => {
    try {
      let parsed = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (!isNaN(value) && value !== '') parsed = Number(value);
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ [key]: parsed }) });
      toast.success(`Setting "${key}" saved`);
      loadSettings();
    } catch (err) { toast.error(err.message); }
  };

  // Setting descriptions for tooltips
  const SETTING_TOOLTIPS = {
    ollamaEnabled: 'Enable or disable the AI Advisor feature for users who opt in.',
    ollamaEndpoint: 'Full URL to your Ollama instance (e.g. http://localhost:11434). Must be reachable from the server.',
    ollamaModel: 'Select which Ollama model to use for generating advice. Click "Refresh" to load available models from the endpoint.',
    defaultAiSystemPrompt: 'System prompt sent to Ollama for all AI advice requests. Leave empty to use the built-in default.',
    defaultAiMaxTokens: 'Max response tokens (100-2000) for AI advice. Controls response length for all users.',
    aiAdviceCooldownMinutes: 'Minimum minutes a user must wait between AI advice refresh requests (1-1440). Prevents excessive API calls.',
    aiAdviceCacheDurationMinutes: 'How long (in minutes) AI advice is cached per user before requiring fresh generation (1-1440).',
    maxGroupsPerUser: 'Maximum number of groups a user can create or join.',
    maxGroupMembers: 'Maximum members allowed in a single group.',
      maxGroupSize: 'Maximum members allowed in a single group.',
    registrationEnabled: 'Allow new users to sign up. Disable to lock registrations.',
    emailVerificationRequired: 'Require email verification before users can log in.',
    smtpHost: 'SMTP server hostname for sending emails.',
    smtpPort: 'SMTP server port (587 for TLS, 465 for SSL, 25 for plain).',
    smtpUser: 'SMTP username / email for authentication.',
    smtpPass: 'SMTP password or app-specific password.',
    smtpFrom: 'Sender email address shown in outgoing emails.',
    appUrl: 'Public URL of the application, used in verification links.',
    appName: 'Application name displayed in emails and UI.',
    logLevel: 'Minimum log level to record (DEBUG, INFO, WARN, ERROR).',
    logRetentionDays: 'Number of days to keep log entries before cleanup.',
    friendStreakEnabled: 'Enable friend streak tracking between connected users.',
    groupStreakEnabled: 'Enable group streak tracking for group members.',
    forceReverifyAllEnabled: 'When enabled, forces all users to re-verify their email.',
    masterDailyGoalMinutes: 'The master daily time goal (in minutes) that applies to all users. When enforcement is off, this is the default for new users.',
    enforceDailyGoal: 'When enabled, ALL users are locked to the master daily goal and cannot change it in their settings.',
    enforce2fa: 'When enabled, ALL users must have two-factor authentication enabled. Users without 2FA will be forced to set it up on their next login.',
    sessionTimeoutDays: 'How long a user stays logged in after their last login before being automatically signed out. Changing this value applies to all new sessions created after the change — existing sessions retain their original expiry. Range: 1–365 days. Default: 30 days.',
    forgottenCheckoutThresholdHours: 'If a user\'s timer runs longer than this many hours, they\'ll see a prominent alert on the Timer and Scheduler pages prompting them to correct the end time. Range: 1–24 hours. Default: 8 hours.',
    minActivityThresholdMinutes: 'Days where total standing time is below this value are excluded from statistics and heatmap activity. This does not affect streak calculations — use the daily goal setting for streak thresholds. Default: 1 minute.',
    vapidPublicKey: 'Public VAPID key for Web Push. Share this with the browser to establish push subscriptions. Generated automatically via the button above.',
    vapidPrivateKey: 'Private VAPID key used server-side to sign push messages. Keep this secret.',
    vapidContactEmail: 'Contact email included in VAPID headers. Must start with "mailto:". Used by push services to contact the app operator if issues arise.',
  };

  // Group settings by section
  const sections = {};
  for (const [key, meta] of Object.entries(settings)) {
    if (HIDDEN_KEYS.has(key)) continue;
    const section = meta.section || 'general';
    if (!sections[section]) sections[section] = [];
    sections[section].push({ key, ...meta });
  }

  const SUPER_ADMIN_SECTIONS = new Set(['mail', 'security']);
  const sectionOrder = ['enforcement', 'scheduler', 'thresholds', 'reporting', 'push', 'server', 'security', 'client', 'mail', 'auth', 'social', 'groups', 'emailAdmin', 'ai', 'logging', 'general']
    .filter(s => !SUPER_ADMIN_SECTIONS.has(s) || isSuperAdmin);

  return (
    <div className="space-y-6">
      {sectionOrder.map((sectionKey) => {
        const items = sections[sectionKey];
        if (!items || items.length === 0) return null;
        const sectionInfo = SECTION_LABELS[sectionKey] || { label: sectionKey, icon: Settings };
        const SectionIcon = sectionInfo.icon;
        return (
          <BentoCard key={sectionKey} className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <SectionIcon size={16} className="text-accent-400" />
              <div>
                <h3 className="text-sm font-semibold text-zen-200">{sectionInfo.label}</h3>
                {sectionInfo.description && <p className="text-[10px] text-zen-600">{sectionInfo.description}</p>}
              </div>
            </div>
            {sectionKey === 'security' && (
              <div className="bg-zen-800/40 rounded-lg p-3 space-y-2">
                <p className="text-xs text-zen-400">Immediately sign out all users by revoking every active session. You will also be signed out.</p>
                <button
                  onClick={async () => {
                    if (!confirm('This will immediately sign out all users including yourself. Continue?')) return;
                    try {
                      const result = await api('/api/admin/sessions/revoke-all', { method: 'POST' });
                      useToastStore.getState().success(result.message || 'All sessions revoked');
                      window.location.href = '/login';
                    } catch (err) { useToastStore.getState().error(err.message); }
                  }}
                  className="btn-ghost text-xs text-danger-400 border border-danger-500/30 flex items-center gap-1"
                >
                  <Lock size={12} />
                  Revoke All Active Sessions
                </button>
              </div>
            )}
            {sectionKey === 'push' && (
              <div className="bg-zen-800/40 rounded-lg p-3 space-y-2">
                <p className="text-xs text-warn-400">Regenerating VAPID keys will invalidate all existing push subscriptions. Users will need to re-enable push notifications.</p>
                <button
                  onClick={async () => {
                    setGeneratingVapid(true);
                    try {
                      const result = await api('/api/admin/push/generate-vapid', { method: 'POST' });
                      useToastStore.getState().success(result.message || 'VAPID keys generated');
                      loadSettings();
                    } catch (err) { useToastStore.getState().error(err.message); }
                    setGeneratingVapid(false);
                  }}
                  disabled={generatingVapid}
                  className="btn-accent text-xs flex items-center gap-1"
                >
                  <KeyRound size={12} />
                  {generatingVapid ? 'Generating...' : 'Generate New VAPID Keys'}
                </button>
              </div>
            )}
            {items.map(({ key, value, description }) => (
              <div key={key} className="flex items-center gap-3 py-1">
                <div className="w-56 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-zen-300 font-mono">{key}</span>
                    {SETTING_TOOLTIPS[key] && (
                      <div className="relative">
                        <button
                          onMouseEnter={() => setTooltip(key)}
                          onMouseLeave={() => setTooltip(null)}
                          className="text-zen-600 hover:text-zen-400 transition-colors"
                        >
                          <Info size={12} />
                        </button>
                        {tooltip === key && (
                          <div className="absolute z-50 left-6 top-0 w-64 p-2 rounded-lg bg-zen-800 border border-zen-600/50 shadow-xl text-xs text-zen-300 leading-relaxed">
                            {SETTING_TOOLTIPS[key]}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {description && <p className="text-[10px] text-zen-600 mt-0.5">{description}</p>}
                </div>
                {/* Ollama model: render as dropdown */}
                {key === 'defaultAiSystemPrompt' ? (
                  <textarea
                    defaultValue={typeof value === 'string' ? value : ''}
                    onBlur={(e) => saveSetting(key, e.target.value)}
                    className="glass-input flex-1 text-sm min-h-[80px] resize-y"
                    placeholder="Enter a default system prompt for the AI advisor..."
                  />
                ) : key === 'ollamaModel' ? (
                  <div className="flex items-center gap-2 flex-1">
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => saveSetting(key, e.target.value)}
                      className="glass-input flex-1 text-sm"
                    >
                      <option value="">— Select model —</option>
                      {ollamaModels.map((m) => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                      {/* If current value not in list, show it anyway */}
                      {value && !ollamaModels.find((m) => m.name === value) && (
                        <option value={value}>{value} (current)</option>
                      )}
                    </select>
                    <button
                      onClick={fetchOllamaModels}
                      disabled={loadingModels}
                      className="btn-ghost text-xs flex items-center gap-1"
                      title="Refresh models from Ollama"
                    >
                      <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
                      {loadingModels ? '' : 'Refresh'}
                    </button>
                  </div>
                ) : typeof value === 'boolean' ? (
                  <button
                    onClick={() => saveSetting(key, String(!value))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-accent-500' : 'bg-zen-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${value ? 'left-5' : 'left-0.5'}`} />
                  </button>
                ) : SENSITIVE_KEYS.has(key) ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type={visiblePasswords[key] ? 'text' : 'password'}
                      defaultValue={typeof value === 'string' ? value : JSON.stringify(value)}
                      onBlur={(e) => saveSetting(key, e.target.value)}
                      className="glass-input flex-1 text-sm"
                    />
                    <button
                      onClick={() => setVisiblePasswords((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="text-zen-500 hover:text-zen-300 transition-colors p-1"
                      title={visiblePasswords[key] ? 'Hide' : 'Show'}
                    >
                      {visiblePasswords[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                ) : (
                  <input
                    defaultValue={typeof value === 'string' ? value : JSON.stringify(value)}
                    onBlur={(e) => saveSetting(key, e.target.value)}
                    className="glass-input flex-1 text-sm"
                  />
                )}
              </div>
            ))}
          </BentoCard>
        );
      })}
      {Object.keys(settings).length === 0 && (
        <BentoCard>
          <p className="text-zen-500 text-sm">No settings configured</p>
        </BentoCard>
      )}
    </div>
  );
}

function ConfigTab() {
  const [audit, setAudit] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api(`/api/admin/audit?page=${page}&limit=20`)
      .then((data) => { setAudit(data.logs || []); setTotal(data.total || 0); })
      .catch(() => {});
  }, [page]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm text-zen-300 font-semibold">Audit Log</h3>
      <BentoCard className="max-h-[600px] overflow-y-auto font-mono text-xs space-y-1 p-4">
        {audit.length === 0 && <p className="text-zen-500">No audit entries</p>}
        {audit.map((log, i) => (
          <div key={i} className="flex gap-3 py-1.5 border-b border-zen-800/50">
            <span className="text-zen-600 shrink-0 w-36">{new Date(log.createdAt).toLocaleString()}</span>
            <span className="text-accent-400 shrink-0 w-36">{log.action}</span>
            <span className="text-zen-400 shrink-0 w-24 truncate">{log.actorId?.slice(0, 8)}</span>
            <span className="text-zen-300 flex-1 truncate">{log.targetId ? `→ ${log.targetId.slice(0, 8)}` : ''} {log.details ? JSON.stringify(log.details).slice(0, 80) : ''}</span>
          </div>
        ))}
      </BentoCard>
      <div className="flex justify-between items-center text-xs text-zen-500">
        <span>{total} entries</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-ghost text-xs">Prev</button>
          <span>Page {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={audit.length < 20} className="btn-ghost text-xs">Next</button>
        </div>
      </div>
    </div>
  );
}
