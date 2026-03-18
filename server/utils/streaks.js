const FriendStreak = require('../models/FriendStreak');
const Friendship = require('../models/Friendship');
const Group = require('../models/Group');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const { getEffectiveGoalMinutes } = require('./settings');

// Get a user's effective goal for a specific date (respects per-day overrides)
async function getUserGoalForDate(userId, date) {
  return getEffectiveGoalMinutes(userId, date);
}

// Get a user's default effective goal (no date-specific override)
async function getUserGoal(userId) {
  return getEffectiveGoalMinutes(userId);
}

// Check if a user met their daily goal on a given date (using per-day override if any)
async function userMetGoal(userId, date) {
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
 * Count how many consecutive days (ending today) both users met their respective goals.
 * Returns 0 if today isn't met by both.
 */
async function countPairStreak(userA, userB) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    const [aOk, bOk] = await Promise.all([
      userMetGoal(userA, date),
      userMetGoal(userB, date),
    ]);
    if (aOk && bOk) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Count how many consecutive days (ending today) ALL group members met their respective goals.
 * Returns 0 if today isn't met by all.
 */
async function countGroupStreak(memberIds) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    const checks = await Promise.all(
      memberIds.map(id => userMetGoal(id, date))
    );
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
 * Call this after a successful tracking save.
 */
async function syncFriendStreaks(userId) {
  const today = dateStr(0);

  // Did this user meet today's goal?
  const userOk = await userMetGoal(userId, today);
  if (!userOk) return; // No point checking pairs if this user hasn't met goal

  // Get all accepted friendships
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

    // Already synced for today — don't double-count
    if (streak.lastSyncDate === today) continue;

    const friendOk = await userMetGoal(friendId, today);
    if (!friendOk) continue; // Friend hasn't met their goal yet

    // Both met their goals today — recalculate streak from scratch
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
    // Already synced for today — don't double-count
    if (group.lastSyncDate === today) continue;

    const memberIds = group.members.map(m => m.userId);

    // Check all members met their own goals today
    const checks = await Promise.all(
      memberIds.map(id => userMetGoal(id, today))
    );
    if (!checks.every(Boolean)) continue; // Not all members met their goals yet

    // All met today — recalculate streak from scratch
    const current = await countGroupStreak(memberIds);
    group.currentStreak = current;
    group.bestStreak = Math.max(group.bestStreak, current);
    group.lastSyncDate = today;
    await group.save();
  }
}

/**
 * Daily cleanup: reset streaks where the day passed without all parties meeting their goals.
 * Should be called periodically (e.g. hourly via setInterval).
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
    const aOk = await userMetGoal(streak.userA, yesterday);
    const bOk = await userMetGoal(streak.userB, yesterday);
    if (!aOk || !bOk) {
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
    if (!checks.every(Boolean)) {
      group.currentStreak = 0;
      await group.save();
    }
  }
}

module.exports = { syncFriendStreaks, syncGroupStreaks, dailyStreakCleanup };
