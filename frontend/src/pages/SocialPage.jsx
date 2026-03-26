import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, UserPlus, UserCheck, UserX, Flame, Calendar, Clock, X, Search, Trash2, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import GitHubHeatmap from '../components/GitHubHeatmap';
import useToastStore from '../stores/useToastStore';
import useSocketStore from '../stores/useSocketStore';

const TABS = [
  { key: 'friends', label: 'Friends', icon: Users },
  { key: 'requests', label: 'Requests', icon: UserCheck },
  { key: 'add', label: 'Add Friend', icon: UserPlus },
];

export default function SocialPage() {
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [onlineSet, setOnlineSet] = useState(new Set());
  const [streaks, setStreaks] = useState({});
  const [heatmap, setHeatmap] = useState(null);
  const [heatmapOffDays, setHeatmapOffDays] = useState({});
  const [heatmapFriend, setHeatmapFriend] = useState(null);
  const [searchUser, setSearchUser] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToastStore();
  const socket = useSocketStore((s) => s.socket);
  // Ref to track which friend streaks have already been fetched (avoids stale closure)
  const streaksFetchedRef = useRef(new Set());

  const loadFriends = useCallback(async () => {
    try {
      const data = await api('/api/social/friends');
      setFriends(data.friends || []);
      const online = new Set();
      (data.friends || []).forEach((f) => { if (f.online) online.add(f.userId); });
      setOnlineSet(online);
    } catch { /* ignore */ }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const [inc, out] = await Promise.all([
        api('/api/social/requests'),
        api('/api/social/requests/outgoing'),
      ]);
      setIncoming(inc.requests || []);
      setOutgoing(out.requests || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  // Socket events for online status and friend list updates
  useEffect(() => {
    if (!socket) return;
    const onOnline = (data) => setOnlineSet((prev) => new Set([...prev, data.userId]));
    const onOffline = (data) => setOnlineSet((prev) => { const n = new Set(prev); n.delete(data.userId); return n; });
    // When a friend request we sent is accepted, refresh the friends list
    const onFriendAccepted = () => {
      loadFriends();
      loadRequests();
    };
    // When a friend's stats update and their heatmap is open, refresh it
    const onFriendStatsUpdate = (data) => {
      if (data.userId && heatmapFriend?.userId === data.userId) {
        api(`/api/social/friend/${data.userId}/heatmap`)
          .then(resp => {
            setHeatmap(resp.heatmap || {});
            setHeatmapOffDays(resp.offDays || {});
          })
          .catch(() => {});
      }
    };
    socket.on('FRIEND_ONLINE', onOnline);
    socket.on('FRIEND_OFFLINE', onOffline);
    socket.on('FRIEND_ACCEPTED', onFriendAccepted);
    socket.on('FRIEND_STATS_UPDATE', onFriendStatsUpdate);
    return () => {
      socket.off('FRIEND_ONLINE', onOnline);
      socket.off('FRIEND_OFFLINE', onOffline);
      socket.off('FRIEND_ACCEPTED', onFriendAccepted);
      socket.off('FRIEND_STATS_UPDATE', onFriendStatsUpdate);
    };
  }, [socket, loadFriends, loadRequests, heatmapFriend]);

  // Load shared streaks for each friend — use ref to avoid stale closure
  useEffect(() => {
    friends.forEach(async (f) => {
      if (streaksFetchedRef.current.has(f.userId)) return;
      streaksFetchedRef.current.add(f.userId);
      try {
        const data = await api(`/api/social/streak/${f.userId}`);
        setStreaks((prev) => ({ ...prev, [f.userId]: data }));
      } catch { /* ignore */ }
    });
  }, [friends]);

  const sendRequest = async () => {
    if (!searchUser.trim()) return;
    setSending(true);
    try {
      await api('/api/social/request', { method: 'POST', body: JSON.stringify({ username: searchUser.trim() }) });
      toast.success('Friend request sent!');
      setSearchUser('');
      loadRequests();
    } catch (err) { toast.error(err.message); }
    setSending(false);
  };

  const acceptRequest = async (id) => {
    try {
      await api(`/api/social/accept/${id}`, { method: 'POST' });
      toast.success('Friend request accepted');
      loadFriends();
      loadRequests();
    } catch (err) { toast.error(err.message); }
  };

  const rejectRequest = async (id) => {
    try {
      await api(`/api/social/reject/${id}`, { method: 'POST' });
      toast.success('Request rejected');
      loadRequests();
    } catch (err) { toast.error(err.message); }
  };

  const cancelRequest = async (id) => {
    try {
      await api(`/api/social/request/${id}`, { method: 'DELETE' });
      toast.success('Request cancelled');
      loadRequests();
    } catch (err) { toast.error(err.message); }
  };

  const unfriend = async (userId) => {
    try {
      await api(`/api/social/unfriend/${userId}`, { method: 'DELETE' });
      toast.success('Unfriended');
      // Remove from the fetched-streaks cache so it reloads if re-added later
      streaksFetchedRef.current.delete(userId);
      setStreaks((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      loadFriends();
    } catch (err) { toast.error(err.message); }
  };

  const viewHeatmap = async (friend) => {
    try {
      const data = await api(`/api/social/friend/${friend.userId}/heatmap`);
      setHeatmap(data.heatmap || {});
      setHeatmapOffDays(data.offDays || {});
      setHeatmapFriend(friend);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-zen-100">Friends</h1>

      {/* Tabs */}
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
            {t.key === 'requests' && incoming.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{incoming.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Friends List */}
      {tab === 'friends' && (
        <div className="space-y-3">
          {friends.length === 0 && (
            <BentoCard className="text-center py-12">
              <Users className="mx-auto mb-3 text-zen-600" size={48} />
              <p className="text-zen-400">No friends yet. Send a friend request to get started!</p>
            </BentoCard>
          )}
          {friends.map((f) => {
            const streak = streaks[f.userId];
            return (
              <BentoCard key={f.userId} className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-zen-700 flex items-center justify-center text-zen-300 font-bold text-lg">
                    {f.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-zen-900 ${onlineSet.has(f.userId) ? 'bg-green-400' : 'bg-zen-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zen-100 font-medium truncate">{f.username}</p>
                  <div className="flex items-center gap-3 text-xs text-zen-500">
                    {onlineSet.has(f.userId) ? (
                      <span className="text-green-400 flex items-center gap-1"><Clock size={10} /> Online</span>
                    ) : (
                      <span>Offline</span>
                    )}
                    {streak && streak.currentStreak > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Flame size={10} /> {streak.currentStreak}d streak
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {f.timerRunning && (
                    <span className="text-[10px] text-accent-400 flex items-center gap-0.5 mr-1">
                      <Timer size={10} className="animate-pulse" /> Timer active
                    </span>
                  )}
                  <button onClick={() => viewHeatmap(f)} className="btn-ghost text-xs flex items-center gap-1">
                    <Calendar size={14} /> Heatmap
                  </button>
                  <button onClick={() => unfriend(f.userId)} className="btn-ghost text-xs text-red-400 hover:text-red-300">
                    <Trash2 size={14} />
                  </button>
                </div>
              </BentoCard>
            );
          })}
        </div>
      )}

      {/* Requests */}
      {tab === 'requests' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-zen-300">Incoming ({incoming.length})</h3>
          {incoming.length === 0 && <p className="text-zen-500 text-sm">No incoming requests</p>}
          {incoming.map((r) => (
            <BentoCard key={r._id} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zen-700 flex items-center justify-center text-zen-300 font-bold">
                {r.requesterName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zen-100 font-medium">{r.requesterName}</p>
                <p className="text-xs text-zen-500">Sent {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => acceptRequest(r._id)} className="btn-accent text-xs flex items-center gap-1">
                  <UserCheck size={14} /> Accept
                </button>
                <button onClick={() => rejectRequest(r._id)} className="btn-ghost text-xs text-red-400">
                  <UserX size={14} /> Reject
                </button>
              </div>
            </BentoCard>
          ))}

          <h3 className="text-sm font-semibold text-zen-300 pt-4">Outgoing ({outgoing.length})</h3>
          {outgoing.length === 0 && <p className="text-zen-500 text-sm">No outgoing requests</p>}
          {outgoing.map((r) => (
            <BentoCard key={r._id} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zen-700 flex items-center justify-center text-zen-300 font-bold">
                {r.recipientName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zen-100 font-medium">{r.recipientName}</p>
                <p className="text-xs text-zen-500">Sent {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => cancelRequest(r._id)} className="btn-ghost text-xs text-zen-400">
                <X size={14} /> Cancel
              </button>
            </BentoCard>
          ))}
        </div>
      )}

      {/* Add Friend */}
      {tab === 'add' && (
        <BentoCard className="max-w-md">
          <h3 className="text-sm font-semibold text-zen-300 mb-4">Send Friend Request</h3>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 glass-input flex-1 !py-0">
              <Search size={16} className="text-zen-500 shrink-0" />
              <input
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
                className="bg-transparent border-none outline-none flex-1 text-zen-100 placeholder:text-zen-500 py-3 text-sm"
                placeholder="Enter username..."
              />
            </div>
            <button onClick={sendRequest} disabled={sending || !searchUser.trim()} className="btn-accent flex items-center gap-2">
              <UserPlus size={16} />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-zen-600 mt-3">Type the exact username of the person you want to add.</p>
        </BentoCard>
      )}

      {/* Heatmap Modal */}
      {heatmap && heatmapFriend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setHeatmap(null); setHeatmapFriend(null); }}>
          <div className="glass-card rounded-xl w-fit max-w-[95vw] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zen-100">{heatmapFriend.username}&apos;s Activity</h3>
              <button onClick={() => { setHeatmap(null); setHeatmapFriend(null); }} className="text-zen-500 hover:text-zen-200">
                <X size={20} />
              </button>
            </div>
            <GitHubHeatmap data={heatmap} offDays={heatmapOffDays} darkMode={true} />
            <p className="text-xs text-zen-500 text-center">
              Last 365 days — {Object.values(heatmap).filter(s => s > 0).length} active days
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
