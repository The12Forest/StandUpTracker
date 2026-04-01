const TrackingData = require('../models/TrackingData');
const DailyGoalOverride = require('../models/DailyGoalOverride');
const OffDay = require('../models/OffDay');
const User = require('../models/User');
const { getEffectiveGoalMinutes } = require('./settings');

/**
 * Recalculate a user's aggregate stats (totalSeconds, totalDays, level)
 * from TrackingData, respecting per-day goal overrides and off days.
 *
 * NOTE: Streaks are NO LONGER calculated here. They are maintained exclusively
 * by server/utils/streaks.js (Trigger A: goal-met, Trigger B: midnight rollover).
 *
 * Updates the User document in-place.
 * Returns the computed stats object (includes current streak/bestStreak from DB for convenience).
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

  // Load off days into a Set for fast lookup
  const offDays = await OffDay.find({ userId });
  const offDaySet = new Set(offDays.map(o => o.date));

  // totalDays: count of non-off days where seconds >= goal
  const totalDays = allData.filter(d =>
    !offDaySet.has(d.date) && d.seconds >= getGoalSecondsForDate(d.date)
  ).length;

  // Level
  const hours = totalSeconds / 3600;
  const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
  let level = 1;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (hours >= levels[i]) { level = i + 1; break; }
  }

  await User.updateOne({ userId }, { totalStandingSeconds: totalSeconds, totalDays, level });

  // Return streak values from DB (maintained by streaks.js) for callers that need them
  return {
    totalSeconds,
    totalDays,
    currentStreak: user.currentStreak || 0,
    bestStreak: user.bestStreak || 0,
    level,
  };
}

module.exports = { recalcUserStats };
