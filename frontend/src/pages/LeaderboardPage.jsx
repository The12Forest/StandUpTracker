import { useEffect, useState } from 'react';
import { Trophy, Medal, Clock, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import { formatTime } from '../lib/utils';

const PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: 'month', label: 'This Month' },
  { value: 'week', label: 'This Week' },
];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState([]);
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/leaderboard?period=${period}&limit=50`)
      .then((data) => setEntries(Array.isArray(data) ? data : data.leaderboard || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [period]);

  const podiumColors = ['text-yellow-400', 'text-zinc-300', 'text-amber-600'];

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
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry._id || i}
                  className="border-b border-zen-700/20 hover:bg-zen-800/30 transition-colors"
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
                      <div className="w-7 h-7 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 text-xs font-bold">
                        {entry.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm text-zen-200 font-medium">{entry.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-mono text-zen-200">
                      {formatTime(entry.totalSeconds || 0)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right hidden sm:table-cell">
                    <span className="text-sm text-zen-400">{entry.totalDays || 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BentoCard>
      )}
    </div>
  );
}
