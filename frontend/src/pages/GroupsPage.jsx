import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Crown, LogOut, Trash2, Plus, Check, X, Flame, Clock, Search } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import useToastStore from '../stores/useToastStore';

const TABS = [
  { key: 'groups', label: 'My Groups', icon: Users },
  { key: 'invites', label: 'Invitations', icon: UserPlus },
  { key: 'create', label: 'Create', icon: Plus },
];

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

  const loadDetail = async (groupId) => {
    if (expanded === groupId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    try {
      const data = await api(`/api/groups/${groupId}`);
      setDetail(data);
      setExpanded(groupId);
    } catch (err) { toast.error(err.message); }
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
                    <div className="flex items-center gap-3 text-xs text-zen-500">
                      <span>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
                      {g.currentStreak > 0 && (
                        <span className="flex items-center gap-1 text-orange-400">
                          <Flame size={10} /> {g.currentStreak}d streak
                        </span>
                      )}
                      {g.bestStreak > 0 && (
                        <span className="text-zen-600">Best: {g.bestStreak}d</span>
                      )}
                    </div>
                  </div>
                </div>
              </BentoCard>

              {/* Expanded detail */}
              {expanded === g.groupId && detail && (
                <div className="ml-4 mt-2 space-y-3">
                  <BentoCard>
                    <h4 className="text-sm font-semibold text-zen-200 mb-3">Members</h4>
                    <div className="space-y-2">
                      {detail.members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-full bg-zen-700 flex items-center justify-center text-zen-300 text-xs font-bold">
                            {m.username[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-zen-200">{m.username}</span>
                            {m.role === 'owner' && <Crown size={10} className="inline ml-1 text-yellow-400" />}
                            <span className="text-zen-600 text-xs ml-2">Lv.{m.level}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-zen-500">{Math.round(m.todaySeconds / 60)}m today</span>
                            {m.metThreshold ? (
                              <span className="text-accent-400 flex items-center gap-0.5"><Check size={10} /> Done</span>
                            ) : (
                              <span className="text-zen-600 flex items-center gap-0.5"><Clock size={10} /> Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
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
                <p className="text-xs text-zen-500">{inv.memberCount} members</p>
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
          <h3 className="text-sm font-semibold text-zen-300 mb-4">Create a New Group</h3>
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
          <p className="text-xs text-zen-600 mt-3">You'll be the owner of this group and can invite others.</p>
        </BentoCard>
      )}
    </div>
  );
}
