import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Coffee, CoffeeIcon, UsersRound, User, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import useAuthStore from '../stores/useAuthStore';
import useSocketStore from '../stores/useSocketStore';
import useToastStore from '../stores/useToastStore';
import useForgottenCheckout from '../hooks/useForgottenCheckout';
import ForgottenCheckoutModal from '../components/ForgottenCheckoutModal';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MEMBER_COLORS = [
  'bg-accent-500/60',
  'bg-purple-500/60',
  'bg-emerald-500/60',
  'bg-amber-500/60',
  'bg-rose-500/60',
  'bg-cyan-500/60',
  'bg-indigo-500/60',
  'bg-lime-500/60',
  'bg-orange-500/60',
  'bg-pink-500/60',
];
const MEMBER_BORDERS = [
  'border-accent-400',
  'border-purple-400',
  'border-emerald-400',
  'border-amber-400',
  'border-rose-400',
  'border-cyan-400',
  'border-indigo-400',
  'border-lime-400',
  'border-orange-400',
  'border-pink-400',
];

function getWeekStart(date, firstDay) {
  const d = new Date(date);
  const jsDay = d.getDay(); // 0=Sun
  const offset = firstDay === 'monday'
    ? (jsDay === 0 ? 6 : jsDay - 1)
    : jsDay;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function getWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { day: dayNames[d.getDay()], date: d.getDate() };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
  return `${m}m`;
}

function sessionToBlock(session) {
  const start = new Date(session.start);
  const end = new Date(session.end);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const duration = (end - start) / 1000;
  return { startHour, endHour: Math.max(endHour, startHour + 0.08), duration, forgottenCheckout: session.forgottenCheckout };
}

// Personal calendar view
function PersonalCalendar({ weekDays, data, offDays, onToggleOffDay, today }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-zen-700/30">
          <div className="p-2" />
          {weekDays.map(dateStr => {
            const { day, date } = formatDayHeader(dateStr);
            const isToday = dateStr === today;
            const isOff = offDays[dateStr];
            return (
              <div key={dateStr} className={`p-2 text-center border-l border-zen-700/20 ${isToday ? 'bg-accent-500/5' : ''}`}>
                <div className={`text-xs ${isToday ? 'text-accent-400 font-semibold' : 'text-zen-500'}`}>{day}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-accent-400' : 'text-zen-200'}`}>{date}</div>
                {isOff && <Coffee size={12} className="text-zen-400 mx-auto mt-0.5" />}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: '576px' }}>
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-[10px] text-zen-600 -translate-y-1/2"
                style={{ top: `${(h / 24) * 100}%` }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(dateStr => {
            const isToday = dateStr === today;
            const isOff = offDays[dateStr];
            const dayData = data[dateStr];
            const sessions = dayData?.sessions || [];

            return (
              <div
                key={dateStr}
                className={`relative border-l border-zen-700/20 ${isToday ? 'bg-accent-500/5' : ''} ${isOff ? 'bg-zen-800/40' : ''}`}
              >
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-zen-700/10"
                    style={{ top: `${(h / 24) * 100}%` }}
                  />
                ))}

                {/* Session blocks */}
                {sessions.map((session, idx) => {
                  const block = sessionToBlock(session);
                  const topPct = (block.startHour / 24) * 100;
                  const heightPct = ((block.endHour - block.startHour) / 24) * 100;
                  return (
                    <div
                      key={idx}
                      className={`absolute left-0.5 right-0.5 rounded-sm ${
                        block.forgottenCheckout
                          ? 'bg-warn-500/40 border-l-2 border-warn-400'
                          : 'bg-accent-500/40 border-l-2 border-accent-400'
                      } overflow-hidden group cursor-default`}
                      style={{ top: `${topPct}%`, height: `${Math.max(heightPct, 0.5)}%` }}
                      title={`${formatDuration(block.duration)}${block.forgottenCheckout ? ' (forgotten checkout)' : ''}`}
                    >
                      {heightPct > 3 && (
                        <div className="p-0.5 text-[9px] text-zen-200 leading-tight truncate">
                          {formatDuration(block.duration)}
                          {block.forgottenCheckout && <AlertTriangle size={8} className="inline ml-0.5 text-warn-400" />}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Off day overlay */}
                {isOff && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-zen-500 bg-zen-800/80 px-2 py-1 rounded">Off Day</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Off-day toggle row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-zen-700/30">
          <div className="p-2 text-[10px] text-zen-600 text-right pr-2">Off</div>
          {weekDays.map(dateStr => {
            const isOff = offDays[dateStr];
            const isPast = dateStr < today;
            return (
              <div key={dateStr} className="p-2 flex justify-center border-l border-zen-700/20">
                <button
                  onClick={() => !isPast && onToggleOffDay(dateStr)}
                  disabled={isPast}
                  className={`w-7 h-3.5 rounded-full transition-colors relative ${isOff ? 'bg-zen-500' : 'bg-zen-700'} ${isPast ? 'opacity-30 cursor-not-allowed' : ''}`}
                  title={isPast ? 'Cannot modify past dates' : isOff ? 'Remove off day' : 'Mark as off day'}
                >
                  <div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-0.5 transition-all ${isOff ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Group calendar view
function getOffDayMembers(members, memberIds, dateStr) {
  const names = [];
  for (const uid of memberIds) {
    if (members[uid]?.offDays?.[dateStr]) names.push(members[uid].username);
  }
  return names;
}

function GroupCalendar({ weekDays, members, selectedMembers, today }) {
  const memberIds = Object.keys(members).filter(id => selectedMembers.has(id));
  const colorMap = {};
  memberIds.forEach((id, i) => {
    colorMap[id] = { bg: MEMBER_COLORS[i % MEMBER_COLORS.length], border: MEMBER_BORDERS[i % MEMBER_BORDERS.length] };
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-zen-700/30">
          <div className="p-2" />
          {weekDays.map(dateStr => {
            const { day, date } = formatDayHeader(dateStr);
            const isToday = dateStr === today;
            return (
              <div key={dateStr} className={`p-2 text-center border-l border-zen-700/20 ${isToday ? 'bg-accent-500/5' : ''}`}>
                <div className={`text-xs ${isToday ? 'text-accent-400 font-semibold' : 'text-zen-500'}`}>{day}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-accent-400' : 'text-zen-200'}`}>{date}</div>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="relative grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: '576px' }}>
          <div className="relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-[10px] text-zen-600 -translate-y-1/2"
                style={{ top: `${(h / 24) * 100}%` }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {weekDays.map(dateStr => {
            const isToday = dateStr === today;
            const offMembers = getOffDayMembers(members, memberIds, dateStr);
            // Collect all sessions from selected members
            const allSessions = [];
            for (const uid of memberIds) {
              const m = members[uid];
              const dayData = m.days?.[dateStr];
              if (!dayData?.sessions) continue;
              for (const s of dayData.sessions) {
                allSessions.push({ ...s, userId: uid });
              }
            }

            return (
              <div key={dateStr} className={`relative border-l border-zen-700/20 ${isToday ? 'bg-accent-500/5' : ''} ${offMembers.length > 0 ? 'bg-zen-800/20' : ''}`}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-t border-zen-700/10" style={{ top: `${(h / 24) * 100}%` }} />
                ))}

                {allSessions.map((session, idx) => {
                  const block = sessionToBlock(session);
                  const topPct = (block.startHour / 24) * 100;
                  const heightPct = ((block.endHour - block.startHour) / 24) * 100;
                  const colors = colorMap[session.userId] || { bg: 'bg-zen-500/40', border: 'border-zen-400' };
                  const username = members[session.userId]?.username || 'Unknown';

                  // Offset slightly if multiple members overlap
                  const memberIdx = memberIds.indexOf(session.userId);
                  const totalSelected = memberIds.length;
                  const widthPct = totalSelected > 1 ? 100 / totalSelected : 100;
                  const leftPct = totalSelected > 1 ? memberIdx * widthPct : 0;

                  return (
                    <div
                      key={idx}
                      className={`absolute rounded-sm ${colors.bg} border-l-2 ${colors.border} overflow-hidden`}
                      style={{
                        top: `${topPct}%`,
                        height: `${Math.max(heightPct, 0.5)}%`,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                      title={`${username}: ${formatDuration(block.duration)}`}
                    >
                      {heightPct > 3 && (
                        <div className="p-0.5 text-[9px] text-zen-200 leading-tight truncate">
                          {username.slice(0, 6)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Off-day indicators for group members */}
                {offMembers.length > 0 && (
                  <div className="absolute bottom-1 left-0 right-0 flex flex-col items-center gap-0.5 pointer-events-none">
                    {offMembers.map(name => (
                      <span key={name} className="text-[8px] text-zen-500 bg-zen-800/80 px-1.5 py-0.5 rounded truncate max-w-full flex items-center gap-0.5">
                        <Coffee size={8} className="shrink-0" /> {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SchedulerPage() {
  const user = useAuthStore((s) => s.user);
  const socket = useSocketStore((s) => s.socket);
  const toast = useToastStore();
  const { forgotten, check: checkForgotten, finalize, discard } = useForgottenCheckout();
  const [showForgottenModal, setShowForgottenModal] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  // Week state
  const firstDayOfWeek = user?.firstDayOfWeek || 'monday';
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(), firstDayOfWeek));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  // View mode
  const [view, setView] = useState('personal'); // 'personal' | 'group'

  // Personal data
  const [personalData, setPersonalData] = useState({});
  const [offDays, setOffDays] = useState({});

  // Group data
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  // Fetch personal data
  const fetchPersonal = useCallback(async () => {
    try {
      const result = await api(`/api/scheduler/sessions?weekStart=${weekStart}`);
      setPersonalData(result.days || {});
      setOffDays(result.offDays || {});
    } catch {
      // silent
    }
  }, [weekStart]);

  // Fetch groups list
  const fetchGroups = useCallback(async () => {
    try {
      const result = await api('/api/groups');
      setGroups(result.groups || []);
      if (!selectedGroupId && result.groups?.length > 0) {
        setSelectedGroupId(result.groups[0].groupId);
      }
    } catch {
      // silent
    }
  }, [selectedGroupId]);

  // Fetch group scheduler data
  const fetchGroupData = useCallback(async () => {
    if (!selectedGroupId) return;
    try {
      const result = await api(`/api/scheduler/group/${selectedGroupId}?weekStart=${weekStart}`);
      setGroupData(result);
      // Auto-select all members
      if (result.members) {
        setSelectedMembers(new Set(Object.keys(result.members)));
      }
    } catch {
      // silent
    }
  }, [selectedGroupId, weekStart]);

  useEffect(() => { fetchPersonal(); }, [fetchPersonal]);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => {
    if (view === 'group') fetchGroupData();
  }, [view, fetchGroupData]);

  // Real-time updates
  useEffect(() => {
    if (!socket) return;
    const onStatsUpdate = () => {
      fetchPersonal();
      if (view === 'group') fetchGroupData();
    };
    const onFriendStats = () => {
      if (view === 'group') fetchGroupData();
    };
    const onOffDayUpdate = () => {
      fetchPersonal();
      if (view === 'group') fetchGroupData();
    };
    socket.on('STATS_UPDATE', onStatsUpdate);
    socket.on('FRIEND_STATS_UPDATE', onFriendStats);
    socket.on('LEADERBOARD_UPDATE', onStatsUpdate);
    socket.on('OFFDAY_UPDATE', onOffDayUpdate);
    return () => {
      socket.off('STATS_UPDATE', onStatsUpdate);
      socket.off('FRIEND_STATS_UPDATE', onFriendStats);
      socket.off('LEADERBOARD_UPDATE', onStatsUpdate);
      socket.off('OFFDAY_UPDATE', onOffDayUpdate);
    };
  }, [socket, view, fetchPersonal, fetchGroupData]);

  // Week navigation
  const navWeek = (dir) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const goToday = () => setWeekStart(getWeekStart(new Date(), firstDayOfWeek));

  // Toggle off day
  const toggleOffDay = async (dateStr) => {
    const isOff = offDays[dateStr];
    try {
      if (isOff) {
        await api(`/api/scheduler/off-days/${dateStr}`, { method: 'DELETE' });
        setOffDays(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
      } else {
        await api('/api/scheduler/off-days', { method: 'POST', body: JSON.stringify({ date: dateStr }) });
        setOffDays(prev => ({ ...prev, [dateStr]: true }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to toggle off day');
    }
  };

  // Toggle member visibility in group view
  const toggleMember = (uid) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // Week label
  const weekLabel = useMemo(() => {
    const start = new Date(weekDays[0] + 'T00:00:00');
    const end = new Date(weekDays[6] + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (start.getMonth() === end.getMonth()) {
      return `${months[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekDays]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Forgotten checkout banner */}
      {forgotten && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warn-500/10 border border-warn-500/30 cursor-pointer hover:bg-warn-500/15 transition-colors"
          onClick={() => setShowForgottenModal(true)}
        >
          <AlertTriangle size={18} className="text-warn-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zen-200 font-medium">Forgotten checkout detected</p>
            <p className="text-xs text-zen-400">Your timer has been running for over {forgotten.thresholdHours}h. Click to resolve.</p>
          </div>
          <span className="text-xs text-warn-400 font-medium shrink-0">Resolve</span>
        </div>
      )}
      {showForgottenModal && forgotten && (
        <ForgottenCheckoutModal
          forgotten={forgotten}
          onFinalize={finalize}
          onDiscard={discard}
          onClose={() => { setShowForgottenModal(false); checkForgotten(); fetchPersonal(); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-accent-400" />
          <h2 className="text-xl font-bold text-zen-100">Scheduler</h2>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-zen-800/60 rounded-lg p-0.5">
          <button
            onClick={() => setView('personal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'personal' ? 'bg-accent-500/20 text-accent-400' : 'text-zen-400 hover:text-zen-200'
            }`}
          >
            <User size={14} /> Personal
          </button>
          <button
            onClick={() => setView('group')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'group' ? 'bg-accent-500/20 text-accent-400' : 'text-zen-400 hover:text-zen-200'
            }`}
          >
            <UsersRound size={14} /> Group
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navWeek(-1)} className="btn-ghost p-1.5"><ChevronLeft size={16} /></button>
          <button onClick={goToday} className="btn-ghost text-xs px-2 py-1">Today</button>
          <button onClick={() => navWeek(1)} className="btn-ghost p-1.5"><ChevronRight size={16} /></button>
        </div>
        <span className="text-sm text-zen-300 font-medium">{weekLabel}</span>
      </div>

      {/* Group selector + member filter */}
      {view === 'group' && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedGroupId || ''}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="glass-input text-sm w-48"
          >
            {groups.map(g => (
              <option key={g.groupId} value={g.groupId}>{g.name}</option>
            ))}
          </select>
          {groupData?.members && (
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(groupData.members).map(([uid, m], idx) => {
                const active = selectedMembers.has(uid);
                return (
                  <button
                    key={uid}
                    onClick={() => toggleMember(uid)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      active
                        ? `${MEMBER_BORDERS[idx % MEMBER_BORDERS.length]} border ${MEMBER_COLORS[idx % MEMBER_COLORS.length].replace('bg-', 'bg-').replace('/60', '/20')} text-zen-200`
                        : 'border-zen-700/30 text-zen-500 opacity-50'
                    }`}
                  >
                    {m.username}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Calendar */}
      <BentoCard className="p-0 overflow-hidden">
        {view === 'personal' ? (
          <PersonalCalendar
            weekDays={weekDays}
            data={personalData}
            offDays={offDays}
            onToggleOffDay={toggleOffDay}
            today={today}
          />
        ) : groupData?.members ? (
          <GroupCalendar
            weekDays={weekDays}
            members={groupData.members}
            selectedMembers={selectedMembers}
            today={today}
          />
        ) : (
          <div className="p-8 text-center text-zen-500 text-sm">
            {groups.length === 0 ? 'You are not in any groups yet.' : 'Loading group schedule...'}
          </div>
        )}
      </BentoCard>
    </div>
  );
}
