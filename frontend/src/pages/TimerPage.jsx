import { useEffect } from 'react';
import { Play, Square, Clock, Flame, Target, TrendingUp } from 'lucide-react';
import useTimerStore from '../stores/useTimerStore';
import useAuthStore from '../stores/useAuthStore';
import { BentoCard, BentoGrid, StatCard } from '../components/BentoCard';
import { formatTime, formatMinutes, levelFromSeconds } from '../lib/utils';

export default function TimerPage() {
  const { running, elapsed, todayTotal, start, stop, loadToday, fetchState } = useTimerStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => { loadToday(); fetchState(); }, [loadToday, fetchState]);

  const displaySeconds = running ? todayTotal + elapsed : todayTotal;
  const goalMinutes = user?.dailyGoalMinutes || 30;
  const goalProgress = Math.min(100, (displaySeconds / (goalMinutes * 60)) * 100);
  const lvl = levelFromSeconds(user?.totalStandingSeconds || 0);

  return (
    <div className="space-y-6">
      {/* Timer Hero */}
      <BentoCard pulse={running} className="text-center py-10 md:col-span-2 xl:col-span-3">
        {/* Session timer */}
        <div className="mb-2 text-xs text-zen-500 uppercase tracking-wider">
          {running ? 'Standing for' : 'Ready to stand'}
        </div>
        <div className="timer-display text-6xl md:text-8xl font-bold text-zen-100 mb-2">
          {formatTime(running ? elapsed : 0)}
        </div>
        <div className="text-sm text-zen-400 mb-4">
          Today: {formatTime(displaySeconds)} ({formatMinutes(displaySeconds)} min)
        </div>

        {/* Running session info: streak + goal progress */}
        {running && (
          <div className="flex items-center justify-center gap-6 mb-6 text-sm">
            {(user?.currentStreak || 0) > 0 && (
              <span className="flex items-center gap-1.5 text-orange-400">
                <Flame size={16} />
                <span className="font-semibold">{user.currentStreak}</span>
                <span className="text-zen-500">day streak</span>
              </span>
            )}
            <span className={`flex items-center gap-1.5 ${goalProgress >= 100 ? 'text-green-400' : 'text-accent-400'}`}>
              <Target size={16} />
              <span className="font-semibold">{Math.round(goalProgress)}%</span>
              <span className="text-zen-500">of goal</span>
            </span>
          </div>
        )}

        {/* Start/Stop button */}
        <button
          onClick={running ? stop : start}
          className={`inline-flex items-center gap-3 px-10 py-4 rounded-2xl text-lg font-bold transition-all duration-300 active:scale-95
            ${running
              ? 'bg-danger-500 hover:bg-danger-400 text-white'
              : 'bg-accent-500 hover:bg-accent-400 text-zen-950'
            }`}
        >
          {running ? <Square size={22} /> : <Play size={22} />}
          {running ? 'Stop' : 'Start Standing'}
        </button>
      </BentoCard>

      {/* Stats Grid */}
      <BentoGrid>
        {/* Daily Goal */}
        <BentoCard>
          <div className="flex items-center gap-3 mb-4">
            <Target size={18} className="text-accent-400" />
            <span className="text-sm text-zen-400">Daily Goal</span>
          </div>
          <div className="relative h-3 bg-zen-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-500"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zen-500">
            <span>{formatMinutes(displaySeconds)} min</span>
            <span>{goalMinutes} min goal</span>
          </div>
        </BentoCard>

        {/* Streak */}
        <StatCard
          label="Current Streak"
          value={`${user?.currentStreak || 0} days`}
          sub={`Best: ${user?.bestStreak || 0} days`}
          icon={Flame}
        />

        {/* Level */}
        <BentoCard>
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp size={18} className="text-accent-400" />
            <span className="text-sm text-zen-400">Level</span>
          </div>
          <p className="text-2xl font-bold text-zen-100">
            Lv.{lvl.level} — {lvl.title}
          </p>
          {lvl.progress < 1 && (
            <div className="mt-3">
              <div className="relative h-2 bg-zen-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500/60 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(lvl.progress * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-zen-500 mt-1">{Math.round(lvl.progress * 100)}% to next level</p>
            </div>
          )}
        </BentoCard>

        {/* Total Time */}
        <StatCard
          label="Total Standing"
          value={formatTime(user?.totalStandingSeconds || 0)}
          sub={`${user?.totalDays || 0} active days`}
          icon={Clock}
        />
      </BentoGrid>
    </div>
  );
}
