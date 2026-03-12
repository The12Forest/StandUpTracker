export function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function levelFromSeconds(totalSeconds) {
  const hours = totalSeconds / 3600;
  const thresholds = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
  const titles = ['Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal'];
  let level = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (hours >= thresholds[i]) { level = i + 1; break; }
  }
  const title = titles[level - 1] || 'Master';
  const currentThreshold = thresholds[level - 1] || 0;
  const nextThreshold = thresholds[level] || Infinity;
  const progress = nextThreshold === Infinity ? 1 : (hours - currentThreshold) / (nextThreshold - currentThreshold);
  return { level, title, next: nextThreshold * 3600, progress: Math.min(1, Math.max(0, progress)) };
}

export function predictDailyGoal(history, goalMinutes = 30) {
  if (!history || history.length < 3) return null;
  const recent = history.slice(-14);
  const avg = recent.reduce((s, d) => s + d.seconds, 0) / recent.length;
  const trend = recent.length >= 7
    ? (recent.slice(-7).reduce((s, d) => s + d.seconds, 0) / 7) -
      (recent.slice(0, 7).reduce((s, d) => s + d.seconds, 0) / 7)
    : 0;
  const predicted = Math.max(0, avg + trend * 0.3);
  return {
    avgSeconds: Math.round(avg),
    trendSeconds: Math.round(trend),
    predictedSeconds: Math.round(predicted),
    willMeetGoal: predicted >= goalMinutes * 60,
    confidence: Math.min(1, recent.length / 14),
  };
}
