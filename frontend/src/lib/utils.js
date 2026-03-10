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
  if (hours < 1) return { level: 1, title: 'Beginner', next: 1 * 3600, progress: hours };
  if (hours < 5) return { level: 2, title: 'Starter', next: 5 * 3600, progress: hours / 5 };
  if (hours < 20) return { level: 3, title: 'Regular', next: 20 * 3600, progress: hours / 20 };
  if (hours < 50) return { level: 4, title: 'Dedicated', next: 50 * 3600, progress: hours / 50 };
  if (hours < 100) return { level: 5, title: 'Veteran', next: 100 * 3600, progress: hours / 100 };
  if (hours < 250) return { level: 6, title: 'Champion', next: 250 * 3600, progress: hours / 250 };
  if (hours < 500) return { level: 7, title: 'Legend', next: 500 * 3600, progress: hours / 500 };
  return { level: 8, title: 'Titan', next: Infinity, progress: 1 };
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
