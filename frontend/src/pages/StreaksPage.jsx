import { useState, useEffect } from 'react';
import { Flame, Users, User, Check, Clock, Trophy, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { BentoCard, BentoGrid } from '../components/BentoCard';
import useAuthStore from '../stores/useAuthStore';
import useTimerStore from '../stores/useTimerStore';

export default function StreaksPage() {
  const [friendStreaks, setFriendStreaks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [thresholdMinutes, setThresholdMinutes] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  // Live today total: persisted seconds + current session elapsed (if timer is running)
  const todayTotal = useTimerStore((s) => s.todayTotal);
  const elapsed = useTimerStore((s) => s.elapsed);
  const todayMinutes = Math.round((todayTotal + elapsed) / 60);

  useEffect(() => {
    Promise.all([
      api('/api/social/streaks').catch(() => ({ streaks: [] })),
      api('/api/groups').catch(() => ({ groups: [] })),
    ]).then(([fs, gs]) => {
      setFriendStreaks(fs.streaks || []);
      setThresholdMinutes(fs.thresholdMinutes || null);
      setGroups(gs.groups || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-zen-500">Loading streaks...</div>;

  const activeFriendStreaks = friendStreaks.filter(s => s.currentStreak > 0);
  const activeGroupStreaks = groups.filter(g => g.currentStreak > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-zen-100 flex items-center gap-2">
        <Flame className="text-orange-400" size={24} />
        Streaks
      </h1>

      {/* Summary cards */}
      <BentoGrid>
        <BentoCard>
          <p className="text-xs text-zen-500">Your Streak</p>
          <p className="text-2xl font-bold text-orange-400 mt-1 flex items-center gap-1">
            <Flame size={18} /> {user?.currentStreak || 0}d
          </p>
          <p className="text-[10px] text-zen-600 mt-0.5">Best: {user?.bestStreak || 0} days</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs text-zen-500">Active Friend Streaks</p>
          <p className="text-2xl font-bold text-zen-100 mt-1">{activeFriendStreaks.length}</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs text-zen-500">Active Group Streaks</p>
          <p className="text-2xl font-bold text-zen-100 mt-1">{activeGroupStreaks.length}</p>
        </BentoCard>
      </BentoGrid>

      {/* Personal streak detail */}
      <div>
        <h2 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <TrendingUp size={14} /> Your Personal Streak
        </h2>
        <BentoCard className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
            <Flame size={20} className="text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-zen-500">Current</p>
                <p className="text-lg font-bold text-orange-400">{user?.currentStreak || 0} day{user?.currentStreak !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-xs text-zen-500">Best Ever</p>
                <p className="text-lg font-bold text-zen-200">{user?.bestStreak || 0} day{user?.bestStreak !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
          <div className="text-center shrink-0">
            <p className="text-xs text-zen-500">Today</p>
            <p className="text-sm font-mono text-zen-300 mt-0.5">{todayMinutes}m</p>
            {thresholdMinutes && (
              <div className="flex items-center gap-1 mt-1">
                {todayMinutes >= thresholdMinutes ? (
                  <span className="text-accent-400 flex items-center gap-0.5 text-[10px]"><Check size={10} /> Goal met</span>
                ) : (
                  <span className="text-zen-600 flex items-center gap-0.5 text-[10px]"><Clock size={10} /> {thresholdMinutes - todayMinutes}m left</span>
                )}
              </div>
            )}
          </div>
        </BentoCard>
      </div>

      {/* Friend Streaks */}
      <div>
        <h2 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <User size={14} /> Friend Streaks
        </h2>
        {friendStreaks.length === 0 ? (
          <BentoCard>
            <p className="text-zen-500 text-sm">Add friends to start building streaks together!</p>
          </BentoCard>
        ) : (
          <div className="space-y-2">
            {friendStreaks.map((s) => (
              <BentoCard key={s.friendId} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-zen-700 flex items-center justify-center text-zen-300 font-bold text-lg">
                  {s.friendName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zen-100 font-medium truncate">{s.friendName}</p>
                  <div className="flex items-center gap-3 text-xs text-zen-500">
                    {s.currentStreak > 0 ? (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Flame size={10} /> {s.currentStreak} day{s.currentStreak !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span>No active streak</span>
                    )}
                    {s.bestStreak > 0 && (
                      <span className="flex items-center gap-1 text-zen-600">
                        <Trophy size={10} /> Best: {s.bestStreak}d
                      </span>
                    )}
                  </div>
                </div>

                {/* Today's status */}
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <div className="text-center">
                    <p className="text-zen-600">You</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {s.myMetThreshold ? (
                        <span className="text-accent-400"><Check size={12} /></span>
                      ) : (
                        <span className="text-zen-600"><Clock size={12} /></span>
                      )}
                      <span className="text-zen-400">{Math.round((s.myTodaySeconds || 0) / 60)}m</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-zen-600">Friend</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {s.friendMetThreshold ? (
                        <span className="text-accent-400"><Check size={12} /></span>
                      ) : (
                        <span className="text-zen-600"><Clock size={12} /></span>
                      )}
                      <span className="text-zen-400">{Math.round((s.friendTodaySeconds || 0) / 60)}m</span>
                    </div>
                  </div>
                </div>
              </BentoCard>
            ))}
          </div>
        )}
      </div>

      {/* Group Streaks */}
      <div>
        <h2 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
          <Users size={14} /> Group Streaks
        </h2>
        {groups.length === 0 ? (
          <BentoCard>
            <p className="text-zen-500 text-sm">Join or create a group to start group streaks!</p>
          </BentoCard>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <BentoCard key={g.groupId} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-bold text-lg">
                  {g.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zen-100 font-medium truncate">{g.name}</p>
                  <div className="flex items-center gap-3 text-xs text-zen-500">
                    <span>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
                    {g.currentStreak > 0 ? (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Flame size={10} /> {g.currentStreak} day{g.currentStreak !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span>No active streak</span>
                    )}
                    {g.bestStreak > 0 && (
                      <span className="flex items-center gap-1 text-zen-600">
                        <Trophy size={10} /> Best: {g.bestStreak}d
                      </span>
                    )}
                  </div>
                </div>
              </BentoCard>
            ))}
          </div>
        )}
      </div>

      {/* Threshold info */}
      {thresholdMinutes && (
        <p className="text-[10px] text-zen-600 text-center">
          Daily goal: {thresholdMinutes} minutes of standing per day
        </p>
      )}
    </div>
  );
}
