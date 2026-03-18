import { useEffect, useState, useRef } from 'react';
import { Clock, Check, Loader2, Calendar, Pencil, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import useToastStore from '../stores/useToastStore';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MyTimePage() {
  const toast = useToastStore();
  const [data, setData] = useState([]);
  const [goalMinutes, setGoalMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [savingRows, setSavingRows] = useState({});
  const [savedRows, setSavedRows] = useState({});
  const [localTimes, setLocalTimes] = useState({});
  const [showAllDays, setShowAllDays] = useState(false);
  const timeDebounceTimers = useRef({});

  useEffect(() => {
    async function load() {
      try {
        const result = await api('/api/my-times');
        setData(result.data || []);
        setGoalMinutes(result.goalMinutes || 60);
      } catch (err) {
        toast.error(err.message || 'Failed to load time data');
      }
      setLoading(false);
    }
    load();
  }, [toast]);

  const today = new Date().toISOString().slice(0, 10);

  // Build data map and date range
  const dataMap = {};
  data.forEach(d => {
    dataMap[d.date] = d;
  });

  // Generate date range: from earliest tracked date (or 90 days ago) to today
  const allDates = [];
  if (data.length > 0 || showAllDays) {
    const dates = data.map(d => d.date).sort();
    const startStr = showAllDays
      ? (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })()
      : dates[0] || today;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(today + 'T00:00:00');
    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      if (showAllDays || dataMap[dateStr]) {
        allDates.push(dateStr);
      }
    }
  }

  const saveRecordedTime = async (date, minutes) => {
    const seconds = Math.round(minutes * 60);
    setSavingRows(prev => ({ ...prev, [date]: true }));
    setSavedRows(prev => ({ ...prev, [date]: false }));
    try {
      const result = await api(`/api/my-times/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ seconds }),
      });
      // Update local data
      setData(prev => prev.map(d => d.date === date ? { ...d, seconds, manualOverride: true, originalSeconds: result.originalSeconds } : d));
      setSavedRows(prev => ({ ...prev, [date]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [date]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to save: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [date]: false }));
  };

  const handleTimeChange = (date, value) => {
    const numVal = value === '' ? null : Number(value);
    setLocalTimes(prev => {
      const next = { ...prev };
      if (numVal === null) delete next[date];
      else next[date] = numVal;
      return next;
    });
    if (timeDebounceTimers.current[date]) clearTimeout(timeDebounceTimers.current[date]);
    if (numVal !== null && numVal >= 0 && numVal <= 1440) {
      timeDebounceTimers.current[date] = setTimeout(() => saveRecordedTime(date, numVal), 800);
    }
  };

  const resetOverride = async (date) => {
    setSavingRows(prev => ({ ...prev, [date]: true }));
    try {
      const result = await api(`/api/my-times/${date}/override`, { method: 'DELETE' });
      setData(prev => prev.map(d => d.date === date ? { ...d, seconds: result.seconds, manualOverride: false, originalSeconds: null } : d));
      setLocalTimes(prev => { const next = { ...prev }; delete next[date]; return next; });
      setSavedRows(prev => ({ ...prev, [date]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [date]: false })), 2000);
      toast.success(`Reset override for ${date}`);
    } catch (err) {
      toast.error(`Failed to reset: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [date]: false }));
  };

  if (loading) return <div className="text-zen-500">Loading your time data...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-accent-400" />
          <div>
            <h2 className="text-xl font-bold text-zen-100">My Time</h2>
            <p className="text-xs text-zen-500">Daily goal: {goalMinutes} min</p>
          </div>
        </div>
        <button
          onClick={() => setShowAllDays(!showAllDays)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          {showAllDays ? <EyeOff size={14} /> : <Eye size={14} />}
          {showAllDays ? 'Show recorded only' : 'Show all days'}
        </button>
      </div>

      <BentoCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-zen-900">
              <tr className="border-b border-zen-700/30">
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-32">Date</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-20">Day</th>
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-48">Recorded Time (min)</th>
                <th className="text-center text-xs text-zen-500 font-normal px-4 py-3 w-20">Goal Met</th>
              </tr>
            </thead>
            <tbody>
              {allDates.length === 0 && (
                <tr><td colSpan={4} className="text-center text-zen-500 py-8 text-sm">No recorded data yet</td></tr>
              )}
              {allDates.map((date) => {
                const dayOfWeek = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
                const record = dataMap[date];
                const recordedSeconds = record?.seconds || 0;
                const isManualOverride = record?.manualOverride;
                const isToday = date === today;
                const isSaving = savingRows[date];
                const isSaved = savedRows[date];
                const currentMinutes = localTimes[date] !== undefined ? localTimes[date] : Math.round(recordedSeconds / 60);
                const goalMet = recordedSeconds >= goalMinutes * 60;

                return (
                  <tr
                    key={date}
                    className={`border-b border-zen-700/20 transition-colors ${
                      isToday ? 'bg-accent-500/5' : 'hover:bg-zen-800/30'
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
                      {record ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={1440}
                            value={currentMinutes}
                            onChange={(e) => handleTimeChange(date, e.target.value)}
                            className={`glass-input w-24 text-sm ${isManualOverride ? 'border-warn-500/30' : ''}`}
                          />
                          {isManualOverride && (
                            <>
                              <Pencil size={12} className="text-warn-400" title="Manually edited" />
                              <button
                                onClick={() => resetOverride(date)}
                                className="text-zen-600 hover:text-accent-400 transition-colors p-0.5"
                                title="Reset to original"
                              >
                                <RotateCcw size={12} />
                              </button>
                            </>
                          )}
                          {isSaving && <Loader2 size={14} className="text-accent-400 animate-spin" />}
                          {isSaved && <Check size={14} className="text-accent-400" />}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-zen-600" />
                          <span className="text-sm text-zen-600">—</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {record && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${goalMet ? 'bg-accent-500/10 text-accent-400' : 'bg-zen-800/40 text-zen-500'}`}>
                          {goalMet ? 'Yes' : 'No'}
                        </span>
                      )}
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
