const FriendStreak = require('../models/FriendStreak');
const Friendship = require('../models/Friendship');
const Group = require('../models/Group');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const { getEffectiveGoalMinutes, isOffDay } = require('./settings');

// Get a user's effective goal for a specific date (respects per-day overrides)
async function getUserGoalForDate(userId, date) {
  return getEffectiveGoalMinutes(userId, date);
}

// Check if a user met their daily goal on a given date (using per-day override if any)
// Returns null for off days (neither met nor missed)
async function userMetGoal(userId, date) {
  if (await isOffDay(userId, date)) return null; // off day — skip
  const goal = await getUserGoalForDate(userId, date);
  const record = await TrackingData.findOne({ userId, date });
  return record && record.seconds >= goal * 60;
}

// Canonical streak pair
function streakPair(a, b) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

// Get date string for N days ago
function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Count how many consecutive non-off days (ending today) both users met their respective goals.
 * Off days are skipped (streak pauses, doesn't break).
 * Returns 0 if the most recent non-off day isn't met by both.
 */
async function countPairStreak(userA, userB) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    const [aResult, bResult] = await Promise.all([
      userMetGoal(userA, date),
      userMetGoal(userB, date),
    ]);
    // If either user has this as an off day, skip it
    if (aResult === null || bResult === null) continue;
    if (aResult && bResult) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Count how many consecutive non-off days (ending today) ALL group members met their respective goals.
 * Off days for ANY member cause that day to be skipped for the whole group.
 */
async function countGroupStreak(memberIds) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    const checks = await Promise.all(
      memberIds.map(id => userMetGoal(id, date))
    );
    // If any member has an off day, skip this date entirely
    if (checks.some(r => r === null)) continue;
    if (checks.every(Boolean)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Sync all friend streaks for a user after they save tracking data.
 */
async function syncFriendStreaks(userId) {
  const today = dateStr(0);

  // Did this user meet today's goal? (null = off day, skip sync)
  const userOk = await userMetGoal(userId, today);
  if (!userOk) return; // Off day or didn't meet goal

  const friendships = await Friendship.find({
    $or: [{ requester: userId }, { recipient: userId }],
    status: 'accepted',
  });

  for (const f of friendships) {
    const friendId = f.requester === userId ? f.recipient : f.requester;
    const pair = streakPair(userId, friendId);
    let streak = await FriendStreak.findOne(pair);
    if (!streak) {
      streak = await FriendStreak.create({ ...pair, currentStreak: 0, bestStreak: 0 });
    }

    if (streak.lastSyncDate === today) continue;

    const friendOk = await userMetGoal(friendId, today);
    if (!friendOk) continue; // Friend off day or hasn't met goal

    const current = await countPairStreak(pair.userA, pair.userB);
    streak.currentStreak = current;
    streak.bestStreak = Math.max(streak.bestStreak, current);
    streak.lastSyncDate = today;
    await streak.save();
  }
}

/**
 * Sync all group streaks for a user after they save tracking data.
 */
async function syncGroupStreaks(userId) {
  const today = dateStr(0);

  const groups = await Group.find({ 'members.userId': userId });

  for (const group of groups) {
    if (group.lastSyncDate === today) continue;

    const memberIds = group.members.map(m => m.userId);

    const checks = await Promise.all(
      memberIds.map(id => userMetGoal(id, today))
    );
    // Skip if any member has off day or hasn't met goal
    if (!checks.every(r => r === true)) continue;

    const current = await countGroupStreak(memberIds);
    group.currentStreak = current;
    group.bestStreak = Math.max(group.bestStreak, current);
    group.lastSyncDate = today;
    await group.save();
  }
}

/**
 * Daily cleanup: reset streaks where the day passed without all parties meeting their goals.
 * Off days are skipped — they don't break streaks.
 */
async function dailyStreakCleanup() {
  const yesterday = dateStr(1);
  const today = dateStr(0);

  // Friend streaks that weren't synced yesterday or today (stale)
  const staleStreaks = await FriendStreak.find({
    currentStreak: { $gt: 0 },
    lastSyncDate: { $nin: [yesterday, today] },
  });

  for (const streak of staleStreaks) {
    const aResult = await userMetGoal(streak.userA, yesterday);
    const bResult = await userMetGoal(streak.userB, yesterday);
    // If either had an off day, don't reset — streak pauses
    if (aResult === null || bResult === null) continue;
    if (!aResult || !bResult) {
      streak.currentStreak = 0;
      await streak.save();
    }
  }

  // Group streaks
  const staleGroups = await Group.find({
    currentStreak: { $gt: 0 },
    lastSyncDate: { $nin: [yesterday, today] },
  });

  for (const group of staleGroups) {
    const memberIds = group.members.map(m => m.userId);
    const checks = await Promise.all(
      memberIds.map(id => userMetGoal(id, yesterday))
    );
    // If any member had an off day, don't reset
    if (checks.some(r => r === null)) continue;
    if (!checks.every(Boolean)) {
      group.currentStreak = 0;
      await group.save();
    }
  }
}

module.exports = { syncFriendStreaks, syncGroupStreaks, dailyStreakCleanup };
