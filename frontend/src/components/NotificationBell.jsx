import { useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Flame, Target, Users, TrendingUp, Clock, UsersRound } from 'lucide-react';
import useNotificationStore from '../stores/useNotificationStore';

const TYPE_ICONS = {
  standup_reminder: Clock,
  streak_at_risk: Flame,
  friend_request: Users,
  friend_request_accepted: Users,
  level_up: TrendingUp,
  daily_goal_reached: Target,
  group_invite: UsersRound,
};

const TYPE_COLORS = {
  standup_reminder: 'text-warn-400',
  streak_at_risk: 'text-danger-400',
  friend_request: 'text-accent-400',
  friend_request_accepted: 'text-accent-400',
  level_up: 'text-accent-400',
  daily_goal_reached: 'text-accent-400',
  group_invite: 'text-accent-400',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, open, toggleOpen, setOpen, fetch: fetchNotifs, markRead, markAllRead } = useNotificationStore();
  const panelRef = useRef(null);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={toggleOpen}
        className="relative p-2 rounded-xl text-zen-400 hover:text-zen-200 hover:bg-zen-800/40 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-danger-500 text-white text-[10px] font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-zen-900 border border-zen-700/50 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zen-700/30">
            <span className="text-sm font-semibold text-zen-200">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1 transition-colors"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-zen-500 text-xs">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Bell;
                const color = TYPE_COLORS[n.type] || 'text-zen-400';
                return (
                  <div
                    key={n._id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-zen-800/40 hover:bg-zen-800/30 transition-colors cursor-pointer
                      ${!n.read ? 'bg-zen-800/20' : ''}`}
                    onClick={() => { if (!n.read) markRead(n._id); }}
                  >
                    <div className={`mt-0.5 ${color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${n.read ? 'text-zen-400' : 'text-zen-200'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-zen-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-zen-600 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <div className="mt-1.5">
                        <div className="w-2 h-2 rounded-full bg-accent-500" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
