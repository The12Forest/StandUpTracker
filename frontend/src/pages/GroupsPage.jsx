import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, UserPlus, Crown, LogOut, Trash2, Plus, Check, X, Flame, Clock, Search, Trophy, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import useToastStore from '../stores/useToastStore';
import useSocketStore from '../stores/useSocketStore';
import useAuthStore from '../stores/useAuthStore';

const TABS = [
  { key: 'groups', label: 'My Groups', icon: Users },
  { key: 'invites', label: 'Invitations', icon: UserPlus },
  { key: 'create', label: 'Create', icon: Plus },
];

const CRITERIA = [
  { key: 'weeklyTime', label: 'Standing time this week' },
  { key: 'totalTime', label: 'Total standing time' },
  { key: 'level', label: 'User level' },
  { key: 'streak', label: 'Current streak' },
];

function formatHm(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function criterionValue(m, criterion) {
  switch (criterion) {
    case 'weeklyTime': return formatHm(m.weeklySeconds);
    case 'totalTime': return formatHm(m.totalStandingSeconds);
    case 'level': return `Lv.${m.level}`;
    case 'streak': return `${m.currentStreak}d`;
    default: return '';
  }
}

function criterionSuffix(criterion) {
  switch (criterion) {
    case 'weeklyTime': return 'this week';
    case 'totalTime': return 'total';
    case 'level': return '';
    case 'streak': return 'streak';
    default: return '';
  }
}

const RANK_COLORS = ['text-yellow-400', 'text-zinc-300', 'text-amber-600'];

export default function GroupsPage() {
  const [tab, setTab] = useState('groups');
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newName, setNewName] = useState('');
  const [inviteUser, setInviteUser] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToastStore();
  const socket = useSocketStore((s) => s.socket);
  const currentUser = useAuthStore((s) => s.user);
  const pendingGroupId = useRef(null);

  const loadGroups = useCallback(async () => {
    try {
      const data = await api('/api/groups');
      setGroups(data.groups || []);
    } catch { /* ignore */ }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const data = await api('/api/groups/invites/pending');
      setInvites(data.invites || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadGroups();
    loadInvites();
  }, [loadGroups, loadInvites]);

  // Listen for real-time group invite events to refresh the invites list
  useEffect(() => {
    if (!socket) return;
    const onGroupInvite = () => loadInvites();
    socket.on('GROUP_INVITE', onGroupInvite);
    return () => socket.off('GROUP_INVITE', onGroupInvite);
  }, [socket, loadInvites]);

  // Real-time leaderboard refresh on timer changes
  const expandedRef = useRef(expanded);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      if (expandedRef.current) {
        api(`/api/groups/${expandedRef.current}`).then(setDetail).catch(() => {});
      }
    };
    socket.on('STATS_UPDATE', refresh);
    socket.on('LEADERBOARD_UPDATE', refresh);
    return () => {
      socket.off('STATS_UPDATE', refresh);
      socket.off('LEADERBOARD_UPDATE', refresh);
    };
  }, [socket]);

  const loadDetail = async (groupId) => {
    if (expanded === groupId) {
      setExpanded(null);
      setDetail(null);
      setInviteUser('');
      pendingGroupId.current = null;
      return;
    }
    setExpanded(null);
    setDetail(null);
    setInviteUser('');
    pendingGroupId.current = groupId;
    try {
      const data = await api(`/api/groups/${groupId}`);
      if (pendingGroupId.current === groupId) {
        setDetail(data);
        setExpanded(groupId);
      }
    } catch (err) { toast.error(err.message); }
  };

  const changeCriterion = async (groupId, criterion) => {
    try {
      await api(`/api/groups/${groupId}/criterion`, { method: 'PUT', body: JSON.stringify({ criterion }) });
      // Refresh detail to get re-sorted members
      const data = await api(`/api/groups/${groupId}`);
      setDetail(data);
      // Update groups list too
      setGroups(prev => prev.map(g => g.groupId === groupId ? { ...g, leaderboardCriterion: criterion } : g));
    } catch (err) { toast.error(err.data?.error || err.message); }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      toast.success('Group created!');
      setNewName('');
      setTab('groups');
      loadGroups();
    } catch (err) { toast.error(err.message); }
    setCreating(false);
  };

  const inviteToGroup = async (groupId) => {
    if (!inviteUser.trim()) return;
    try {
      await api(`/api/groups/${groupId}/invite`, { method: 'POST', body: JSON.stringify({ username: inviteUser.trim() }) });
      toast.success('Invitation sent!');
      setInviteUser('');
    } catch (err) { toast.error(err.message); }
  };

  const acceptInvite = async (groupId) => {
    try {
      await api(`/api/groups/${groupId}/accept`, { method: 'POST' });
      toast.success('Joined group!');
      loadGroups();
      loadInvites();
    } catch (err) { toast.error(err.message); }
  };

  const declineInvite = async (groupId) => {
    try {
      await api(`/api/groups/${groupId}/decline`, { method: 'POST' });
      toast.success('Invitation declined');
      loadInvites();
    } catch (err) { toast.error(err.message); }
  };

  const leaveGroup = async (groupId) => {
    if (!confirm('Leave this group?')) return;
    try {
      await api(`/api/groups/${groupId}/leave`, { method: 'POST' });
      toast.success('Left group');
      setExpanded(null);
      setDetail(null);
      loadGroups();
    } catch (err) { toast.error(err.message); }
  };

  const deleteGroup = async (groupId) => {
    if (!confirm('Delete this group? This cannot be undone.')) return;
    try {
      await api(`/api/groups/${groupId}`, { method: 'DELETE' });
      toast.success('Group deleted');
      setExpanded(null);
      setDetail(null);
      loadGroups();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-zen-100">Groups</h1>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-accent-600 text-white' : 'glass-card text-zen-400 hover:text-zen-200'
            }`}
          >
            <t.icon size={16} />
            {t.label}
            {t.key === 'invites' && invites.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{invites.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* My Groups */}
      {tab === 'groups' && (
        <div className="space-y-3">
          {groups.length === 0 && (
            <BentoCard className="text-center py-12">
              <Users className="mx-auto mb-3 text-zen-600" size={48} />
              <p className="text-zen-400">No groups yet. Create one or accept an invitation!</p>
            </BentoCard>
          )}
          {groups.map((g) => (
            <div key={g.groupId}>
              <BentoCard
                className="cursor-pointer hover:border-accent-500/30 transition-colors"
                onClick={() => loadDetail(g.groupId)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-bold text-lg">
                    {g.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-zen-100 font-medium truncate">{g.name}</p>
                      {g.myRole === 'owner' && <Crown size={12} className="text-yellow-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zen-400">
                      <span>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
                      {g.currentStreak > 0 && (
                        <span className="flex items-center gap-1 text-orange-400">
                          <Flame size={10} /> {g.currentStreak}d streak
                        </span>
                      )}
                      {g.bestStreak > 0 && (
                        <span className="text-zen-500">Best: {g.bestStreak}d</span>
                      )}
                    </div>
                  </div>
                </div>
              </BentoCard>

              {/* Expanded detail — leaderboard */}
              {expanded === g.groupId && detail && (
                <div className="ml-4 mt-2 space-y-3">
                  <BentoCard>
                    {/* Criterion header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Trophy size={14} className="text-accent-400" />
                        <span className="text-sm font-semibold text-zen-200">Leaderboard</span>
                      </div>
                      {g.myRole === 'owner' ? (
                        <div className="relative">
                          <select
                            value={detail.leaderboardCriterion || 'weeklyTime'}
                            onChange={(e) => changeCriterion(g.groupId, e.target.value)}
                            className="bg-zen-800 border border-zen-700/50 rounded-lg text-xs text-zen-300 pl-2 pr-7 py-1.5 appearance-none cursor-pointer"
                          >
                            {CRITERIA.map(c => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zen-500 pointer-events-none" />
                        </div>
                      ) : (
                        <span className="text-[11px] text-zen-400">
                          Ranked by: {CRITERIA.find(c => c.key === detail.leaderboardCriterion)?.label || 'Standing time this week'}
                        </span>
                      )}
                    </div>

                    {/* Member rows */}
                    <div className="space-y-1">
                      {detail.members.map((m, idx) => {
                        const isMe = m.userId === currentUser?.userId;
                        const rank = idx + 1;
                        const criterion = detail.leaderboardCriterion || 'weeklyTime';
                        return (
                          <div
                            key={m.userId}
                            className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg transition-colors ${
                              isMe ? 'bg-accent-500/8 border border-accent-500/20' : 'hover:bg-zen-800/30'
                            }`}
                          >
                            {/* Rank */}
                            <span className={`w-6 text-center font-bold text-sm ${
                              rank <= 3 ? RANK_COLORS[rank - 1] : 'text-zen-500'
                            }`}>
                              {rank}
                            </span>
                            {/* Avatar */}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              rank === 1 ? 'bg-yellow-500/20 text-yellow-400'
                                : rank === 2 ? 'bg-zinc-400/20 text-zinc-300'
                                : rank === 3 ? 'bg-amber-600/20 text-amber-500'
                                : 'bg-zen-700 text-zen-300'
                            }`}>
                              {m.username[0]?.toUpperCase()}
                            </div>
                            {/* Name + level */}
                            <div className="flex-1 min-w-0">
                              <span className={`${isMe ? 'text-zen-100 font-semibold' : 'text-zen-200'} truncate`}>{m.username}</span>
                              {m.role === 'owner' && <Crown size={10} className="inline ml-1 text-yellow-400" />}
                              <span className="text-zen-400 text-xs ml-2">Lv.{m.level}</span>
                            </div>
                            {/* Criterion value */}
                            <div className="text-right shrink-0">
                              <span className="text-zen-200 text-xs font-medium">{criterionValue(m, criterion)}</span>
                              {criterionSuffix(criterion) && (
                                <span className="text-zen-500 text-[10px] ml-1">{criterionSuffix(criterion)}</span>
                              )}
                            </div>
                            {/* Today + goal */}
                            <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                              <span className="text-zen-400">{Math.round(m.todaySeconds / 60)}m today</span>
                              {m.metThreshold ? (
                                <span className="text-accent-400 flex items-center gap-0.5"><Check size={10} /> Done</span>
                              ) : (
                                <span className="text-zen-500 flex items-center gap-0.5"><Clock size={10} /> Pending</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </BentoCard>

                  {/* Invite user */}
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2 glass-input flex-1 !py-0">
                      <Search size={14} className="text-zen-500 shrink-0" />
                      <input
                        value={inviteUser}
                        onChange={(e) => setInviteUser(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && inviteToGroup(g.groupId)}
                        className="bg-transparent border-none outline-none flex-1 text-zen-100 placeholder:text-zen-500 py-2.5 text-sm"
                        placeholder="Invite username..."
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); inviteToGroup(g.groupId); }} className="btn-accent text-xs flex items-center gap-1">
                      <UserPlus size={14} /> Invite
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); leaveGroup(g.groupId); }} className="btn-ghost text-xs text-zen-400 flex items-center gap-1">
                      <LogOut size={12} /> Leave
                    </button>
                    {g.myRole === 'owner' && (
                      <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.groupId); }} className="btn-ghost text-xs text-danger-400 flex items-center gap-1">
                        <Trash2 size={12} /> Delete Group
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invitations */}
      {tab === 'invites' && (
        <div className="space-y-3">
          {invites.length === 0 && (
            <BentoCard className="text-center py-12">
              <UserPlus className="mx-auto mb-3 text-zen-600" size={48} />
              <p className="text-zen-400">No pending invitations</p>
            </BentoCard>
          )}
          {invites.map((inv) => (
            <BentoCard key={inv.groupId} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-bold text-lg">
                {inv.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zen-100 font-medium">{inv.name}</p>
                <p className="text-xs text-zen-400">{inv.memberCount} members</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => acceptInvite(inv.groupId)} className="btn-accent text-xs flex items-center gap-1">
                  <Check size={14} /> Join
                </button>
                <button onClick={() => declineInvite(inv.groupId)} className="btn-ghost text-xs text-red-400">
                  <X size={14} /> Decline
                </button>
              </div>
            </BentoCard>
          ))}
        </div>
      )}

      {/* Create Group */}
      {tab === 'create' && (
        <BentoCard className="max-w-md">
          <h3 className="text-sm font-semibold text-zen-200 mb-4">Create a New Group</h3>
          <div className="flex gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              className="glass-input flex-1"
              placeholder="Group name (2-50 chars)"
            />
            <button onClick={createGroup} disabled={creating || !newName.trim()} className="btn-accent flex items-center gap-2">
              <Plus size={16} />
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
          <p className="text-xs text-zen-400 mt-3">You&apos;ll be the owner of this group and can invite others.</p>
        </BentoCard>
      )}
    </div>
  );
}
