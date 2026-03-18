const TrackingData = require('../models/TrackingData');
const DailyGoalOverride = require('../models/DailyGoalOverride');
const User = require('../models/User');
const { getEffectiveGoalMinutes } = require('./settings');

/**
 * Recalculate a user's aggregate stats (totalSeconds, totalDays, streaks, level)
 * from TrackingData, respecting per-day goal overrides.
 * Updates the User document in-place.
 * Returns the computed stats object for optional use by callers.
 */
async function recalcUserStats(userId) {
  const user = await User.findOne({ userId });
  if (!user) return null;

  const allData = await TrackingData.find({ userId });
  const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
  const defaultGoal = await getEffectiveGoalMinutes(user);
  const defaultGoalSeconds = defaultGoal * 60;

  // Load per-day overrides
  const overrides = await DailyGoalOverride.find({ userId });
  const overrideMap = {};
  overrides.forEach(o => { overrideMap[o.date] = o.goalMinutes * 60; });
  const getGoalSecondsForDate = (date) => overrideMap[date] || defaultGoalSeconds;

  const totalDays = allData.filter(d => d.seconds >= getGoalSecondsForDate(d.date)).length;
  const dataMap = {};
  allData.forEach(d => { dataMap[d.date] = d.seconds; });
  const sorted = allData.map(d => d.date).sort().reverse();

  // Current streak: walk backward from today
  let currentStreak = 0;
  const todayDate = new Date();
  for (let i = 0; i < 3650; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if ((dataMap[dateStr] || 0) >= getGoalSecondsForDate(dateStr)) currentStreak++;
    else break;
  }

  // Best streak: walk forward through all tracked days
  let bestStreak = 0, run = 0;
  if (sorted.length > 0) {
    const firstDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');
    const lastDate = new Date(sorted[0] + 'T00:00:00');
    for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      if ((dataMap[dateStr] || 0) >= getGoalSecondsForDate(dateStr)) { run++; bestStreak = Math.max(bestStreak, run); }
      else run = 0;
    }
  }

  // Level
  const hours = totalSeconds / 3600;
  const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
  let level = 1;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (hours >= levels[i]) { level = i + 1; break; }
  }

  await User.updateOne({ userId }, { totalStandingSeconds: totalSeconds, totalDays, currentStreak, bestStreak, level });

  return { totalSeconds, totalDays, currentStreak, bestStreak, level };
}

module.exports = { recalcUserStats };
