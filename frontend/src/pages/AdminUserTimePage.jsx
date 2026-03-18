import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Check, Loader2, X, Calendar } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import useToastStore from '../stores/useToastStore';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMinutesDisplay(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export default function AdminUserTimePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToastStore();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingRows, setSavingRows] = useState({});
  const [savedRows, setSavedRows] = useState({});
  const [localOverrides, setLocalOverrides] = useState({});
  const debounceTimers = useRef({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api(`/api/admin/users/${userId}/daily-times`);
        if (!cancelled) {
          setData(result);
          setLocalOverrides(result.overrideMap || {});
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message || 'Failed to load data');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId, toast]);

  // Generate all dates from startDate to endDate
  const allDates = [];
  if (data) {
    const start = new Date(data.startDate + 'T00:00:00');
    const end = new Date(data.endDate + 'T00:00:00');
    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
  }

  const saveOverride = async (date, goalMinutes) => {
    setSavingRows(prev => ({ ...prev, [date]: true }));
    setSavedRows(prev => ({ ...prev, [date]: false }));
    try {
      await api(`/api/admin/users/${userId}/daily-goal/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ goalMinutes: Number(goalMinutes) }),
      });
      setSavedRows(prev => ({ ...prev, [date]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [date]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to save ${date}: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [date]: false }));
  };

  const handleOverrideChange = (date, value) => {
    const numVal = value === '' ? null : Number(value);
    setLocalOverrides(prev => {
      const next = { ...prev };
      if (numVal === null) {
        delete next[date];
      } else {
        next[date] = numVal;
      }
      return next;
    });

    // Debounced auto-save
    if (debounceTimers.current[date]) clearTimeout(debounceTimers.current[date]);
    if (numVal !== null && numVal >= 1 && numVal <= 1440) {
      debounceTimers.current[date] = setTimeout(() => {
        saveOverride(date, numVal);
      }, 800);
    }
  };

  const clearOverride = async (date) => {
    setSavingRows(prev => ({ ...prev, [date]: true }));
    try {
      await api(`/api/admin/users/${userId}/daily-goal/${date}`, { method: 'DELETE' });
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      setSavedRows(prev => ({ ...prev, [date]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [date]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to clear override: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [date]: false }));
  };

  if (loading) return <div className="text-zen-500">Loading user time data...</div>;
  if (!data) return <div className="text-zen-500">Failed to load data.</div>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="btn-ghost text-xs flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Users
        </button>
        <span className="text-zen-600">/</span>
        <span className="text-sm text-zen-300">Edit Daily Times</span>
      </div>

      <div className="flex items-center gap-3">
        <Calendar size={20} className="text-accent-400" />
        <div>
          <h2 className="text-xl font-bold text-zen-100">
            {data.username}
          </h2>
          <p className="text-xs text-zen-500">
            Default daily goal: {data.defaultGoalMinutes} min &middot; User ID: {data.userId?.slice(0, 8)}
          </p>
        </div>
      </div>

      <BentoCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-zen-900">
              <tr className="border-b border-zen-700/30">
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-32">Date</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-20">Day</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-32">Recorded Time</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-48">Target Time (min)</th>
                <th className="text-center text-xs text-zen-500 font-normal px-4 py-3 w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {allDates.map((date) => {
                const dayOfWeek = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
                const recordedSeconds = data.trackingMap[date] || 0;
                const hasOverride = localOverrides[date] !== undefined;
                const isToday = date === today;
                const isFuture = date > today;
                const isSaving = savingRows[date];
                const isSaved = savedRows[date];

                return (
                  <tr
                    key={date}
                    className={`border-b border-zen-700/20 transition-colors ${
                      isToday ? 'bg-accent-500/5' : isFuture ? 'bg-zen-800/20' : 'hover:bg-zen-800/30'
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className={`text-sm font-mono ${isToday ? 'text-accent-400 font-semibold' : 'text-zen-300'}`}>
                        {date}
                      </span>
                      {isToday && <span className="text-[10px] text-accent-400 ml-1.5">today</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-sm ${dayOfWeek === 'Sat' || dayOfWeek === 'Sun' ? 'text-warn-400' : 'text-zen-400'}`}>
                        {dayOfWeek}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-zen-600" />
                        <span className={`text-sm font-mono ${recordedSeconds > 0 ? 'text-zen-200' : 'text-zen-600'}`}>
                          {formatMinutesDisplay(recordedSeconds)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={hasOverride ? localOverrides[date] : ''}
                          onChange={(e) => handleOverrideChange(date, e.target.value)}
                          placeholder={String(data.defaultGoalMinutes)}
                          className={`glass-input w-24 text-sm ${hasOverride ? 'border-accent-500/30' : 'opacity-60'}`}
                        />
                        {hasOverride && (
                          <button
                            onClick={() => clearOverride(date)}
                            className="text-zen-600 hover:text-danger-400 transition-colors p-0.5"
                            title="Clear Override"
                          >
                            <X size={14} />
                          </button>
                        )}
                        {!hasOverride && (
                          <span className="text-[10px] text-zen-600">default</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isSaving ? (
                        <Loader2 size={14} className="text-accent-400 animate-spin inline-block" />
                      ) : isSaved ? (
                        <Check size={14} className="text-accent-400 inline-block" />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BentoCard>
    </div>
  );
}
