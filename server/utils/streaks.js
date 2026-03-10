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

// Canonical streak pair
function streakPair(a, b) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

// Get today's date string
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Get yesterday's date string
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Sync all friend streaks for a user after they save tracking data.
 * Call this after a successful tracking save.
 */
async function syncFriendStreaks(userId) {
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const today = todayStr();
  const yesterday = yesterdayStr();

  // Did this user meet today's threshold?
  const userOk = await userMetThreshold(userId, today, threshold);

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

    // Already synced for today
    if (streak.lastSyncDate === today) continue;

    const friendOk = await userMetThreshold(friendId, today, threshold);

    if (userOk && friendOk) {
      // Both met threshold today
      // Check if streak was already going (synced yesterday)
      if (streak.lastSyncDate === yesterday || streak.currentStreak === 0) {
        streak.currentStreak += 1;
        streak.bestStreak = Math.max(streak.bestStreak, streak.currentStreak);
      } else {
        // Gap — reset and start new streak
        streak.currentStreak = 1;
      }
      streak.lastSyncDate = today;
      await streak.save();
    }
    // If only one met threshold, we don't reset yet —
    // the streak breaks only when the day is over and one didn't meet it.
    // We handle that in the daily cleanup.
  }
}

/**
 * Sync all group streaks for a user after they save tracking data.
 */
async function syncGroupStreaks(userId) {
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const today = todayStr();
  const yesterday = yesterdayStr();

  const groups = await Group.find({ 'members.userId': userId });

  for (const group of groups) {
    if (group.lastSyncDate === today) continue;

    // Check all members
    const memberIds = group.members.map(m => m.userId);
    const checks = await Promise.all(
      memberIds.map(id => userMetThreshold(id, today, threshold))
    );
    const allMet = checks.every(Boolean);

    if (allMet) {
      if (group.lastSyncDate === yesterday || group.currentStreak === 0) {
        group.currentStreak += 1;
        group.bestStreak = Math.max(group.bestStreak, group.currentStreak);
      } else {
        group.currentStreak = 1;
      }
      group.lastSyncDate = today;
      await group.save();
    }
  }
}

/**
 * Daily cleanup: reset streaks where the day passed without all parties meeting threshold.
 * Should be called once per day (e.g. via setInterval or a cron).
 */
async function dailyStreakCleanup() {
  const threshold = await Settings.get('streakThresholdMinutes') || 3;
  const yesterday = yesterdayStr();

  // Friend streaks that weren't synced yesterday
  const staleStreaks = await FriendStreak.find({
    currentStreak: { $gt: 0 },
    lastSyncDate: { $ne: yesterday, $ne: todayStr() },
  });

  for (const streak of staleStreaks) {
    // Check if both users met threshold yesterday
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
    lastSyncDate: { $ne: yesterday, $ne: todayStr() },
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
