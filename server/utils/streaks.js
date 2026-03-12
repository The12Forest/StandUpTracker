const FriendStreak = require('../models/FriendStreak');
const Friendship = require('../models/Friendship');
const Group = require('../models/Group');
const TrackingData = require('../models/TrackingData');
const Settings = require('../models/Settings');

// Check if a user met the streak threshold on a given date
async function userMetThreshold(userId, date, thresholdMinutes) {
  const record = await TrackingData.findOne({ userId, date });
  return record && record.seconds >= thresholdMinutes * 60;
}

// Check if BOTH users in a pair met threshold on a given date
async function pairMetThreshold(userA, userB, date, threshold) {
  const [aOk, bOk] = await Promise.all([
    userMetThreshold(userA, date, threshold),
    userMetThreshold(userB, date, threshold),
  ]);
  return aOk && bOk;
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
 * Count how many consecutive days (ending today) both users met threshold.
 * Returns 0 if today isn't met by both.
 */
async function countPairStreak(userA, userB, threshold) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    if (await pairMetThreshold(userA, userB, date, threshold)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Count how many consecutive days (ending today) ALL group members met threshold.
 * Returns 0 if today isn't met by all.
 */
async function countGroupStreak(memberIds, threshold) {
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const date = dateStr(i);
    const checks = await Promise.all(
      memberIds.map(id => userMetThreshold(id, date, threshold))
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
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const today = dateStr(0);

  // Did this user meet today's threshold?
  const userOk = await userMetThreshold(userId, today, threshold);
  if (!userOk) return; // No point checking pairs if this user hasn't met threshold

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

    const friendOk = await userMetThreshold(friendId, today, threshold);
    if (!friendOk) continue; // Friend hasn't met threshold yet

    // Both met threshold today — recalculate streak from scratch
    const current = await countPairStreak(pair.userA, pair.userB, threshold);
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
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const today = dateStr(0);

  const groups = await Group.find({ 'members.userId': userId });

  for (const group of groups) {
    // Already synced for today — don't double-count
    if (group.lastSyncDate === today) continue;

    // Check all members
    const memberIds = group.members.map(m => m.userId);
    const checks = await Promise.all(
      memberIds.map(id => userMetThreshold(id, today, threshold))
    );
    if (!checks.every(Boolean)) continue; // Not all members met threshold yet

    // All met today — recalculate streak from scratch
    const current = await countGroupStreak(memberIds, threshold);
    group.currentStreak = current;
    group.bestStreak = Math.max(group.bestStreak, current);
    group.lastSyncDate = today;
    await group.save();
  }
}

/**
 * Daily cleanup: reset streaks where the day passed without all parties meeting threshold.
 * Should be called periodically (e.g. hourly via setInterval).
 */
async function dailyStreakCleanup() {
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const yesterday = dateStr(1);
  const today = dateStr(0);

  // Friend streaks that weren't synced yesterday or today (stale)
  const staleStreaks = await FriendStreak.find({
    currentStreak: { $gt: 0 },
    lastSyncDate: { $nin: [yesterday, today] },
  });

  for (const streak of staleStreaks) {
    const aOk = await userMetThreshold(streak.userA, yesterday, threshold);
    const bOk = await userMetThreshold(streak.userB, yesterday, threshold);
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
      memberIds.map(id => userMetThreshold(id, yesterday, threshold))
    );
    if (!checks.every(Boolean)) {
      group.currentStreak = 0;
      await group.save();
    }
  }
}

module.exports = { syncFriendStreaks, syncGroupStreaks, dailyStreakCleanup };
