import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Check, Loader2, X, Calendar, Pencil, RotateCcw, Eye, EyeOff, Coffee, Flag, Undo2, AlertTriangle } from 'lucide-react';
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
  const [localTimes, setLocalTimes] = useState({});
  const [localOffDays, setLocalOffDays] = useState({});
  const [reportClearedMap, setReportClearedMap] = useState({});
  const [showAllDays, setShowAllDays] = useState(true);
  const debounceTimers = useRef({});
  const timeDebounceTimers = useRef({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api(`/api/admin/users/${userId}/daily-times`);
        if (!cancelled) {
          setData(result);
          setLocalOverrides(result.overrideMap || {});
          setLocalOffDays(result.offDayMap || {});
          setReportClearedMap(result.reportClearedMap || {});
        }
      } catch (err) {
        if (!cancelled) useToastStore.getState().error(err.message || 'Failed to load data');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Generate all dates from startDate to endDate
  const allDates = [];
  if (data) {
    const start = new Date(data.startDate + 'T00:00:00');
    const end = new Date(data.endDate + 'T00:00:00');
    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Filter dates based on toggle
  const visibleDates = showAllDays
    ? allDates
    : allDates.filter(date => (data?.trackingMap[date] || 0) > 0 || localOffDays[date]);

  const saveOverride = async (date, goalMinutes) => {
    setSavingRows(prev => ({ ...prev, [`goal-${date}`]: true }));
    setSavedRows(prev => ({ ...prev, [`goal-${date}`]: false }));
    try {
      await api(`/api/admin/users/${userId}/daily-goal/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ goalMinutes: Number(goalMinutes) }),
      });
      setSavedRows(prev => ({ ...prev, [`goal-${date}`]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [`goal-${date}`]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to save ${date}: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [`goal-${date}`]: false }));
  };

  const handleOverrideChange = (date, value) => {
    const numVal = value === '' ? null : Number(value);
    setLocalOverrides(prev => {
      const next = { ...prev };
      if (numVal === null) delete next[date];
      else next[date] = numVal;
      return next;
    });
    if (debounceTimers.current[date]) clearTimeout(debounceTimers.current[date]);
    if (numVal !== null && numVal >= 1 && numVal <= 1440) {
      debounceTimers.current[date] = setTimeout(() => saveOverride(date, numVal), 800);
    }
  };

  const clearOverride = async (date) => {
    setSavingRows(prev => ({ ...prev, [`goal-${date}`]: true }));
    try {
      await api(`/api/admin/users/${userId}/daily-goal/${date}`, { method: 'DELETE' });
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      setSavedRows(prev => ({ ...prev, [`goal-${date}`]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [`goal-${date}`]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to clear override: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [`goal-${date}`]: false }));
  };

  // Recorded time editing
  const saveRecordedTime = async (date, minutes) => {
    const seconds = Math.round(minutes * 60);
    setSavingRows(prev => ({ ...prev, [`time-${date}`]: true }));
    setSavedRows(prev => ({ ...prev, [`time-${date}`]: false }));
    try {
      await api(`/api/admin/tracking/${userId}/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ seconds }),
      });
      setData(prev => ({
        ...prev,
        trackingMap: { ...prev.trackingMap, [date]: seconds },
        manualOverrideMap: { ...prev.manualOverrideMap, [date]: true },
      }));
      setSavedRows(prev => ({ ...prev, [`time-${date}`]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [`time-${date}`]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to save time for ${date}: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [`time-${date}`]: false }));
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
    setSavingRows(prev => ({ ...prev, [`time-${date}`]: true }));
    try {
      await api(`/api/admin/tracking/${userId}/${date}/override`, { method: 'DELETE' });
      const result = await api(`/api/admin/users/${userId}/daily-times`);
      setData(result);
      setLocalTimes(prev => { const next = { ...prev }; delete next[date]; return next; });
      setSavedRows(prev => ({ ...prev, [`time-${date}`]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [`time-${date}`]: false })), 2000);
      toast.success(`Reset override for ${date}`);
    } catch (err) {
      toast.error(`Failed to reset: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [`time-${date}`]: false }));
  };

  // Off day toggle
  const toggleOffDay = async (date) => {
    const isCurrentlyOff = !!localOffDays[date];
    setSavingRows(prev => ({ ...prev, [`off-${date}`]: true }));
    try {
      if (isCurrentlyOff) {
        await api(`/api/admin/users/${userId}/off-day/${date}`, { method: 'DELETE' });
        setLocalOffDays(prev => { const next = { ...prev }; delete next[date]; return next; });
      } else {
        await api(`/api/admin/users/${userId}/off-day/${date}`, { method: 'PUT' });
        setLocalOffDays(prev => ({ ...prev, [date]: true }));
      }
      setSavedRows(prev => ({ ...prev, [`off-${date}`]: true }));
      setTimeout(() => setSavedRows(prev => ({ ...prev, [`off-${date}`]: false })), 2000);
    } catch (err) {
      toast.error(`Failed to toggle off day: ${err.message}`);
    }
    setSavingRows(prev => ({ ...prev, [`off-${date}`]: false }));
  };

  const restoreReportCleared = async (date) => {
    if (!confirm(`Restore the original recorded time for ${date}? This will undo the report-based clearing.`)) return;
    setSavingRows(prev => ({ ...prev, [`restore-${date}`]: true }));
    try {
      const result = await api(`/api/admin/users/${userId}/restore-report/${date}`, { method: 'POST' });
      // Refresh data
      const refreshed = await api(`/api/admin/users/${userId}/daily-times`);
      setData(refreshed);
      setLocalOverrides(refreshed.overrideMap || {});
      setLocalOffDays(refreshed.offDayMap || {});
      setReportClearedMap(refreshed.reportClearedMap || {});
      toast.success(result.message || 'Progress restored');
    } catch (err) {
      toast.error(err.data?.error || err.message || 'Failed to restore');
    }
    setSavingRows(prev => ({ ...prev, [`restore-${date}`]: false }));
  };

  if (loading) return <div className="text-zen-500">Loading user time data...</div>;
  if (!data) return <div className="text-zen-500">Failed to load data.</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin?tab=users')} className="btn-ghost text-xs flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Users
        </button>
        <span className="text-zen-600">/</span>
        <span className="text-sm text-zen-300">Edit Daily Times</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-accent-400" />
          <div>
            <h2 className="text-xl font-bold text-zen-100">{data.username}</h2>
            <p className="text-xs text-zen-500">
              Default daily goal: {data.defaultGoalMinutes} min &middot; User ID: {data.userId?.slice(0, 8)}
            </p>
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
                <th className="text-left text-xs text-zen-500 font-normal px-4 py-3 w-48">Target Time (min)</th>
                <th className="text-center text-xs text-zen-500 font-normal px-4 py-3 w-24">Off Day</th>
                <th className="text-center text-xs text-zen-500 font-normal px-4 py-3 w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleDates.map((date) => {
                const dayOfWeek = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
                const recordedSeconds = data.trackingMap[date] || 0;
                const hasGoalOverride = localOverrides[date] !== undefined;
                const isManualOverride = data.manualOverrideMap?.[date];
                const isForgottenCheckout = data.forgottenCheckoutMap?.[date];
                const isOffDay = !!localOffDays[date];
                const reportCleared = reportClearedMap[date];
                const isToday = date === today;
                const isFuture = date > today;
                const isGoalSaving = savingRows[`goal-${date}`];
                const isGoalSaved = savedRows[`goal-${date}`];
                const isTimeSaving = savingRows[`time-${date}`];
                const isTimeSaved = savedRows[`time-${date}`];
                const isOffSaving = savingRows[`off-${date}`];
                const isOffSaved = savedRows[`off-${date}`];
                const currentMinutes = localTimes[date] !== undefined ? localTimes[date] : Math.round(recordedSeconds / 60);

                return (
                  <tr
                    key={date}
                    className={`border-b border-zen-700/20 transition-colors ${
                      reportCleared && !reportCleared.restored ? 'bg-danger-500/10 border-l-2 border-l-danger-400' :
                      isOffDay ? 'bg-zen-800/40 opacity-70' :
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
                        {isForgottenCheckout && (
                          <span className="flex items-center gap-0.5 text-[10px] text-warn-400 bg-warn-500/10 px-1 py-0.5 rounded" title="Contains a forgotten checkout session">
                            <AlertTriangle size={10} /> FC
                          </span>
                        )}
                        {isTimeSaving && <Loader2 size={14} className="text-accent-400 animate-spin" />}
                        {isTimeSaved && <Check size={14} className="text-accent-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={hasGoalOverride ? localOverrides[date] : ''}
                          onChange={(e) => handleOverrideChange(date, e.target.value)}
                          placeholder={String(data.defaultGoalMinutes)}
                          className={`glass-input w-24 text-sm ${hasGoalOverride ? 'border-accent-500/30' : 'opacity-60'}`}
                        />
                        {hasGoalOverride && (
                          <button
                            onClick={() => clearOverride(date)}
                            className="text-zen-600 hover:text-danger-400 transition-colors p-0.5"
                            title="Clear Override"
                          >
                            <X size={14} />
                          </button>
                        )}
                        {!hasGoalOverride && <span className="text-[10px] text-zen-600">default</span>}
                        {isGoalSaving && <Loader2 size={14} className="text-accent-400 animate-spin" />}
                        {isGoalSaved && <Check size={14} className="text-accent-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => toggleOffDay(date)}
                          className={`w-8 h-4 rounded-full transition-colors relative ${isOffDay ? 'bg-zen-500' : 'bg-zen-700'}`}
                          title={isOffDay ? 'Clear off day' : 'Mark as off day'}
                        >
                          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${isOffDay ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                        {isOffDay && <Coffee size={12} className="text-zen-400" />}
                        {isOffSaving && <Loader2 size={12} className="text-accent-400 animate-spin" />}
                        {isOffSaved && <Check size={12} className="text-accent-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {reportCleared && !reportCleared.restored ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-[10px] text-danger-400 bg-danger-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Flag size={9} /> Cleared ({reportCleared.reportCount})
                          </span>
                          <span className="text-[10px] text-zen-600">was {formatMinutesDisplay(reportCleared.preReportSeconds)}</span>
                          <button
                            onClick={() => restoreReportCleared(date)}
                            disabled={savingRows[`restore-${date}`]}
                            className="text-[10px] px-1 py-0.5 rounded text-accent-400 hover:bg-accent-500/10 flex items-center gap-0.5"
                            title="Restore original time"
                          >
                            {savingRows[`restore-${date}`] ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />} Restore
                          </button>
                        </div>
                      ) : reportCleared?.restored ? (
                        <span className="text-[10px] text-accent-400 bg-accent-500/10 px-1.5 py-0.5 rounded">Restored</span>
                      ) : isOffDay ? (
                        <span className="text-[10px] text-zen-500 bg-zen-700/50 px-1.5 py-0.5 rounded">off</span>
                      ) : recordedSeconds > 0 ? (
                        <span className="text-[10px] text-zen-500">{formatMinutesDisplay(recordedSeconds)}</span>
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
