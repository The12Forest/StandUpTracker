import { useEffect, useState, useCallback, useRef } from 'react';
import { Trophy, Medal, Clock, Flame, Flag, Timer, Calendar } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import { formatTime } from '../lib/utils';
import useSocketStore from '../stores/useSocketStore';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

function periodHeader(period) {
  const now = new Date();
  if (period === 'today') {
    return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (period === 'month') {
    return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (period === 'week') {
    return `Week of ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return null;
}

// Live elapsed seconds for a running timer
function useLiveElapsed(timerStartedAt, running) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !timerStartedAt) { setElapsed(0); return; }
    const calc = () => Math.max(0, Math.round((Date.now() - new Date(timerStartedAt).getTime()) / 1000));
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [running, timerStartedAt]);
  return elapsed;
}

function LiveTimeCell({ totalSeconds, timerRunning, timerStartedAt }) {
  const liveElapsed = useLiveElapsed(timerStartedAt, timerRunning);
  const display = timerRunning ? totalSeconds + liveElapsed : totalSeconds;
  return (
    <span className="text-sm font-mono text-zen-200">
      {formatTime(display)}
    </span>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState([]);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const [reportModal, setReportModal] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportedSessions, setReportedSessions] = useState(new Set());
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const socket = useSocketStore((s) => s.socket);
  const currentUser = useAuthStore((s) => s.user);
  const toast = useToastStore();
  const periodRef = useRef(period);
  useEffect(() => { periodRef.current = period; }, [period]);

  const fetchLeaderboard = useCallback(async (p) => {
    try {
      const data = await api(`/api/leaderboard?period=${p || periodRef.current}&limit=50`);
      setEntries(Array.isArray(data) ? data : data.leaderboard || []);
    } catch {
      setEntries([]);
    }
  }, []);

  // Initial load + period change
  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(period).finally(() => setLoading(false));
  }, [period, fetchLeaderboard]);

  // WebSocket real-time updates
  useEffect(() => {
    if (!socket) return;

    // When any user's stats update, refresh leaderboard
    const onStatsUpdate = () => fetchLeaderboard();
    // When a friend's stats update (covers other users stopping timers)
    const onFriendStats = () => fetchLeaderboard();
    // Global leaderboard refresh event (emitted by server on any timer start/stop)
    const onLeaderboardUpdate = () => fetchLeaderboard();

    socket.on('STATS_UPDATE', onStatsUpdate);
    socket.on('FRIEND_STATS_UPDATE', onFriendStats);
    socket.on('LEADERBOARD_UPDATE', onLeaderboardUpdate);

    return () => {
      socket.off('STATS_UPDATE', onStatsUpdate);
      socket.off('FRIEND_STATS_UPDATE', onFriendStats);
      socket.off('LEADERBOARD_UPDATE', onLeaderboardUpdate);
    };
  }, [socket, fetchLeaderboard]);

  // Check which users have been reported by current user
  useEffect(() => {
    const running = entries.filter(e => e.timerRunning && e.userId !== currentUser?.userId);
    running.forEach(async (e) => {
      try {
        const data = await api(`/api/reports/check/${e.userId}`);
        if (data.reported) {
          setReportedSessions(prev => new Set([...prev, e.userId]));
        }
      } catch { /* ignore */ }
    });
  }, [entries, currentUser?.userId]);

  const submitReport = async () => {
    if (!reportModal) return;
    setReportSubmitting(true);
    try {
      const data = await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: reportModal.userId, reason: reportReason }),
      });
      toast.success(data.message || 'Report submitted');
      setReportedSessions(prev => new Set([...prev, reportModal.userId]));
      setReportModal(null);
      setReportReason('');
    } catch (err) {
      toast.error(err.data?.error || err.message);
    }
    setReportSubmitting(false);
  };

  const podiumColors = ['text-yellow-400', 'text-zinc-300', 'text-amber-600'];
  const header = periodHeader(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zen-100 flex items-center gap-2">
          <Trophy size={20} className="text-accent-400" />
          Leaderboard
        </h2>
        <div className="flex gap-1 bg-zen-900/60 border border-zen-700/40 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all
                ${period === p.value
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'text-zen-500 hover:text-zen-300'
                }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {header && (
        <div className="flex items-center gap-2 text-sm text-zen-400">
          <Calendar size={14} />
          {header}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <BentoCard className="text-center py-12">
          <p className="text-zen-500">No data yet. Start tracking!</p>
        </BentoCard>
      ) : (
        <BentoCard className="p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zen-700/30">
                <th className="text-left text-xs text-zen-500 font-normal px-6 py-3 w-16">#</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3">User</th>
                <th className="text-right text-xs text-zen-500 font-normal px-6 py-3">Time</th>
                <th className="text-right text-xs text-zen-500 font-normal px-6 py-3 hidden sm:table-cell">Days</th>
                <th className="text-right text-xs text-zen-500 font-normal px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.userId || i}
                  className={`border-b border-zen-700/20 hover:bg-zen-800/30 transition-colors ${
                    entry.timerRunning ? 'bg-accent-500/5' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    {i < 3 ? (
                      <Medal size={18} className={podiumColors[i]} />
                    ) : (
                      <span className="text-sm text-zen-500">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 text-xs font-bold">
                          {entry.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        {entry.timerRunning && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-zen-900 animate-pulse" />
                        )}
                      </div>
                      <div>
                        <span className="text-sm text-zen-200 font-medium">{entry.username}</span>
                        <div className="flex items-center gap-2">
                          {entry.timerRunning && (
                            <span className="text-[10px] text-accent-400 flex items-center gap-0.5">
                              <Timer size={9} className="animate-pulse" /> Standing
                            </span>
                          )}
                          {entry.currentStreak > 0 && (
                            <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                              <Flame size={9} /> {entry.currentStreak}d
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {period === 'today' ? (
                      <LiveTimeCell
                        totalSeconds={entry.totalSeconds || 0}
                        timerRunning={entry.timerRunning}
                        timerStartedAt={entry.timerStartedAt}
                      />
                    ) : (
                      <span className="text-sm font-mono text-zen-200">
                        {formatTime(entry.totalSeconds || 0)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right hidden sm:table-cell">
                    <span className="text-sm text-zen-400">{entry.totalDays || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {entry.timerRunning && entry.userId !== currentUser?.userId && (
                      reportedSessions.has(entry.userId) ? (
                        <span className="text-[10px] text-zen-500 px-1.5 py-0.5 bg-zen-800 rounded">Reported</span>
                      ) : (
                        <button
                          onClick={() => setReportModal({ userId: entry.userId, username: entry.username })}
                          className="btn-ghost text-xs text-warn-400 hover:text-warn-300 flex items-center gap-0.5 ml-auto"
                          title="Report timer abuse"
                        >
                          <Flag size={12} /> Report
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BentoCard>
      )}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setReportModal(null); setReportReason(''); }}>
          <div className="glass-card rounded-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zen-200 flex items-center gap-2">
              <Flag size={16} className="text-warn-400" />
              Report {reportModal.username}
            </h3>
            <p className="text-xs text-zen-500">
              Report this user for having their timer running while not standing at their desk.
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 200))}
              className="glass-input w-full text-sm resize-none"
              rows={3}
              placeholder="Optional: describe why you are reporting (max 200 chars)"
            />
            <p className="text-[10px] text-zen-600 text-right">{reportReason.length}/200</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setReportModal(null); setReportReason(''); }} className="btn-ghost text-xs">Cancel</button>
              <button onClick={submitReport} disabled={reportSubmitting} className="btn-accent text-xs">
                {reportSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
