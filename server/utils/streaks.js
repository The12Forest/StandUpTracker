const FriendStreak = require('../models/FriendStreak');
const Friendship = require('../models/Friendship');
const Group = require('../models/Group');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getEffectiveGoalMinutes, isOffDay } = require('./settings');
const logger = require('./logger');
const { sendPushNotification } = require('./pushSender');
const { dispatchWebhook } = require('./webhookDispatch');
const { resetDailyNotificationCounts, shouldDispatchNotification, incrementNotificationCount } = require('./notificationGate');

// ─── Helpers ───

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function streakPair(a, b) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

/**
 * Walk backward from a starting date counting consecutive goal-met days.
 * Off days are skipped (pauses streak, doesn't break it).
 * Uses the goalMet flag on TrackingData for efficiency.
 * @param {string} userId
 * @param {string} [startDate] - YYYY-MM-DD to start from (default: today)
 * @param {number} [maxDays=3650] - max calendar days to look back
 * @returns {Promise<number>} streak count
 */
async function computePersonalStreak(userId, startDate, maxDays = 3650) {
  const start = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  let count = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (await isOffDay(userId, ds)) continue;
    const record = await TrackingData.findOne({ userId, date: ds }).select('goalMet seconds').lean();
    if (record && record.goalMet) {
      count++;
    } else {
      // Today is special: goal may not be met yet, don't break streak
      const today = dateStr(0);
      if (ds === today) continue;
      break;
    }
  }
  return count;
}

/**
 * Compute best streak by walking forward through all tracking data.
 */
async function computeBestStreak(userId) {
  const OffDay = require('../models/OffDay');
  const offDays = await OffDay.find({ userId });
  const offDaySet = new Set(offDays.map(o => o.date));

  const allData = await TrackingData.find({ userId }).select('date goalMet').lean();
  const goalMetSet = new Set();
  for (const d of allData) {
    if (d.goalMet) goalMetSet.add(d.date);
  }

  const sorted = allData.map(d => d.date).sort();
  if (sorted.length === 0) return 0;

  let best = 0, run = 0;
  const firstDate = new Date(sorted[0] + 'T00:00:00');
  const lastDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');
  for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (offDaySet.has(ds)) continue;
    if (goalMetSet.has(ds)) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

// ─── Trigger A: Check and set goal_met, update personal streak ───

/**
 * Evaluate whether a user met their goal for a given date.
 * Sets/clears the goalMet flag on TrackingData.
 * Recalculates personal streak and emits STREAK_UPDATE via WebSocket.
 * Called after any tracking data or goal/off-day mutation.
 *
 * @param {string} userId
 * @param {string} date - YYYY-MM-DD
 * @param {object} io - Socket.io server instance (optional)
 */
async function checkAndSetGoalMet(userId, date, io) {
  try {
    const offDay = await isOffDay(userId, date);
    const record = await TrackingData.findOne({ userId, date });

    if (!record) {
      // No tracking record — goal not met. Still recalc streak in case data was deleted.
      await recalcPersonalStreak(userId, io);
      return;
    }

    if (offDay) {
      // Off days: goalMet should be false (excluded from streak logic)
      if (record.goalMet) {
        record.goalMet = false;
        await record.save();
      }
      await recalcPersonalStreak(userId, io);
      return;
    }

    const goalMinutes = await getEffectiveGoalMinutes(userId, date);
    const goalSeconds = goalMinutes * 60;
    const shouldBeMet = record.seconds >= goalSeconds;

    if (shouldBeMet !== record.goalMet) {
      record.goalMet = shouldBeMet;
      await record.save();
    }

    // Always recalc personal streak (handles both increment and decrement cases)
    await recalcPersonalStreak(userId, io);
  } catch (err) {
    logger.error(`checkAndSetGoalMet failed for ${userId} on ${date}: ${err.message}`, { source: 'streaks' });
  }
}

/**
 * Recalculate personal streak from TrackingData and update User document.
 * Emits STREAK_UPDATE if streak changed.
 */
async function recalcPersonalStreak(userId, io) {
  const user = await User.findOne({ userId });
  if (!user) return;

  const oldCurrent = user.currentStreak || 0;
  const oldBest = user.bestStreak || 0;

  const currentStreak = await computePersonalStreak(userId);
  const bestStreak = Math.max(oldBest, currentStreak, await computeBestStreak(userId));

  if (currentStreak !== oldCurrent || bestStreak !== oldBest) {
    await User.updateOne({ userId }, { currentStreak, bestStreak });

    if (io) {
      io.to(`user:${userId}`).emit('STREAK_UPDATE', { currentStreak, bestStreak });
    }

    // Streak milestone notification (increment only)
    if (currentStreak > oldCurrent && currentStreak > 0) {
      // Webhook: streak.incremented
      dispatchWebhook(userId, 'streak.incremented', { currentStreak, previousStreak: oldCurrent }).catch(() => {});

      const milestones = [3, 7, 14, 30, 50, 100, 200, 365];
      const todayMidnight = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
      const existingMilestone = milestones.includes(currentStreak)
        ? await Notification.findOne({ userId, type: 'streak_milestone', 'data.streak': currentStreak, createdAt: { $gte: todayMidnight } })
        : null;
      if (!existingMilestone && milestones.includes(currentStreak) && await shouldDispatchNotification(userId, 'streak_milestone')) {
        const notif = await Notification.create({
          userId, type: 'streak_milestone', title: 'Streak Milestone!',
          message: `You reached a ${currentStreak}-day streak! Keep it going!`,
          data: { streak: currentStreak },
        });
        await incrementNotificationCount(userId);
        if (io) io.to(`user:${userId}`).emit('NOTIFICATION', notif.toObject());
        sendPushNotification(userId, 'streak_milestone', {
          title: 'StandUpTracker', body: notif.message,
        }).catch(() => {});
      }
    }
  }
}

// ─── Trigger B: Midnight Rollover ───

// Track which dates the midnight job has already processed (idempotency)
let _lastMidnightDate = null;

/**
 * Midnight rollover job. Evaluates all active streaks for the previous day.
 * - Personal streaks: break if yesterday's goal not met (and not an off day)
 * - Friend streaks: increment if both met yesterday, break if either missed
 * - Group streaks: increment if all met yesterday, break if any missed
 * Idempotent: safe to run multiple times for the same date.
 */
async function midnightRollover(io) {
  const yesterday = dateStr(1);
  const today = dateStr(0);

  // Idempotency check
  if (_lastMidnightDate === today) {
    logger.info('Midnight rollover already ran for today, skipping', { source: 'streaks' });
    return;
  }

  const startTime = Date.now();
  logger.info(`Midnight rollover starting for ${yesterday}`, { source: 'streaks' });

  // Reset daily notification counts for all users
  await resetDailyNotificationCounts();

  let usersEvaluated = 0;
  let personalBroken = 0;
  let friendBroken = 0;
  let friendIncremented = 0;
  let groupBroken = 0;
  let groupIncremented = 0;

  // ── Personal streaks ──
  const usersWithStreaks = await User.find({ currentStreak: { $gt: 0 }, active: true }).select('userId currentStreak bestStreak');
  usersEvaluated = usersWithStreaks.length;

  for (const user of usersWithStreaks) {
    try {
      if (await isOffDay(user.userId, yesterday)) continue;

      const record = await TrackingData.findOne({ userId: user.userId, date: yesterday }).select('goalMet').lean();
      if (record && record.goalMet) continue; // Goal was met — Trigger A already handled the increment

      // Goal not met yesterday — break streak
      const oldStreak = user.currentStreak;
      await User.updateOne({ userId: user.userId }, { currentStreak: 0 });
      personalBroken++;

      if (io) {
        io.to(`user:${user.userId}`).emit('STREAK_UPDATE', { currentStreak: 0, bestStreak: user.bestStreak });
      }

      // Webhook: streak.broken
      dispatchWebhook(user.userId, 'streak.broken', { previousStreak: oldStreak }).catch(() => {});

      // Notification for streak broken (respects quiet hours + daily limit)
      if (oldStreak >= 3 && await shouldDispatchNotification(user.userId, 'streak_broken')) {
        const notif = await Notification.create({
          userId: user.userId, type: 'streak_broken', title: 'Streak Broken',
          message: `Your ${oldStreak}-day streak ended. Start a new one today!`,
          data: { previousStreak: oldStreak },
        });
        await incrementNotificationCount(user.userId);
        if (io) io.to(`user:${user.userId}`).emit('NOTIFICATION', notif.toObject());
        sendPushNotification(user.userId, 'streak_broken', {
          title: 'StandUpTracker', body: notif.message,
        }).catch(() => {});
      }
    } catch (err) {
      logger.error(`Midnight personal streak check failed for ${user.userId}: ${err.message}`, { source: 'streaks' });
    }
  }

  // ── Friend streaks ──
  const allFriendStreaks = await FriendStreak.find({ currentStreak: { $gt: 0 } });
  // Also find friend streaks that could be incremented (lastSyncDate !== yesterday)
  const incrementableFriendStreaks = await FriendStreak.find({
    lastSyncDate: { $ne: yesterday },
  });

  // Merge sets (use Map to avoid duplicates)
  const friendStreakMap = new Map();
  for (const fs of allFriendStreaks) friendStreakMap.set(fs._id.toString(), fs);
  for (const fs of incrementableFriendStreaks) friendStreakMap.set(fs._id.toString(), fs);

  for (const streak of friendStreakMap.values()) {
    try {
      if (streak.lastSyncDate === yesterday) continue; // Already processed

      const aOffDay = await isOffDay(streak.userA, yesterday);
      const bOffDay = await isOffDay(streak.userB, yesterday);
      // If either has off day, skip (streak pauses)
      if (aOffDay || bOffDay) continue;

      const aRecord = await TrackingData.findOne({ userId: streak.userA, date: yesterday }).select('goalMet').lean();
      const bRecord = await TrackingData.findOne({ userId: streak.userB, date: yesterday }).select('goalMet').lean();
      const aMet = aRecord && aRecord.goalMet;
      const bMet = bRecord && bRecord.goalMet;

      if (aMet && bMet) {
        // Both met — increment
        streak.currentStreak += 1;
        streak.bestStreak = Math.max(streak.bestStreak, streak.currentStreak);
        streak.lastSyncDate = yesterday;
        await streak.save();
        friendIncremented++;

        if (io) {
          const data = { currentStreak: streak.currentStreak, bestStreak: streak.bestStreak, userA: streak.userA, userB: streak.userB };
          io.to(`user:${streak.userA}`).emit('FRIEND_STREAK_UPDATE', data);
          io.to(`user:${streak.userB}`).emit('FRIEND_STREAK_UPDATE', data);
        }
      } else if (streak.currentStreak > 0) {
        // At least one missed — break
        const oldStreak = streak.currentStreak;
        streak.currentStreak = 0;
        streak.lastSyncDate = yesterday;
        await streak.save();
        friendBroken++;

        if (io) {
          const data = { currentStreak: 0, bestStreak: streak.bestStreak, userA: streak.userA, userB: streak.userB };
          io.to(`user:${streak.userA}`).emit('FRIEND_STREAK_UPDATE', data);
          io.to(`user:${streak.userB}`).emit('FRIEND_STREAK_UPDATE', data);
        }

        // Notification (gated by quiet hours + daily limit)
        if (oldStreak >= 3) {
          for (const uid of [streak.userA, streak.userB]) {
            if (await shouldDispatchNotification(uid, 'friend_streak_broken')) {
              const notif = await Notification.create({
                userId: uid, type: 'friend_streak_broken', title: 'Friend Streak Broken',
                message: `Your ${oldStreak}-day friend streak ended.`,
                data: { previousStreak: oldStreak, userA: streak.userA, userB: streak.userB },
              });
              await incrementNotificationCount(uid);
              if (io) io.to(`user:${uid}`).emit('NOTIFICATION', notif.toObject());
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Midnight friend streak check failed for ${streak.userA}/${streak.userB}: ${err.message}`, { source: 'streaks' });
    }
  }

  // ── Group streaks ──
  const allGroups = await Group.find({
    $or: [
      { currentStreak: { $gt: 0 } },
      { lastSyncDate: { $ne: yesterday } },
    ],
  });

  for (const group of allGroups) {
    try {
      if (group.lastSyncDate === yesterday) continue;

      const memberIds = group.members.map(m => m.userId);
      if (memberIds.length === 0) continue;

      // Check if any member has off day — skip day if so
      let anyOffDay = false;
      for (const mid of memberIds) {
        if (await isOffDay(mid, yesterday)) { anyOffDay = true; break; }
      }
      if (anyOffDay) continue;

      // Check if all members met goal
      let allMet = true;
      for (const mid of memberIds) {
        const record = await TrackingData.findOne({ userId: mid, date: yesterday }).select('goalMet').lean();
        if (!record || !record.goalMet) { allMet = false; break; }
      }

      if (allMet) {
        group.currentStreak += 1;
        group.bestStreak = Math.max(group.bestStreak, group.currentStreak);
        group.lastSyncDate = yesterday;
        await group.save();
        groupIncremented++;

        if (io) {
          const data = { groupId: group.groupId, currentStreak: group.currentStreak, bestStreak: group.bestStreak };
          for (const mid of memberIds) {
            io.to(`user:${mid}`).emit('GROUP_STREAK_UPDATE', data);
          }
        }
      } else if (group.currentStreak > 0) {
        const oldStreak = group.currentStreak;
        group.currentStreak = 0;
        group.lastSyncDate = yesterday;
        await group.save();
        groupBroken++;

        if (io) {
          const data = { groupId: group.groupId, currentStreak: 0, bestStreak: group.bestStreak };
          for (const mid of memberIds) {
            io.to(`user:${mid}`).emit('GROUP_STREAK_UPDATE', data);
          }
        }

        if (oldStreak >= 3) {
          for (const mid of memberIds) {
            if (await shouldDispatchNotification(mid, 'group_streak_broken')) {
              const notif = await Notification.create({
                userId: mid, type: 'group_streak_broken', title: 'Group Streak Broken',
                message: `Your group "${group.name}" lost its ${oldStreak}-day streak.`,
                data: { previousStreak: oldStreak, groupId: group.groupId },
              });
              await incrementNotificationCount(mid);
              if (io) io.to(`user:${mid}`).emit('NOTIFICATION', notif.toObject());
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Midnight group streak check failed for group ${group.groupId}: ${err.message}`, { source: 'streaks' });
    }
  }

  _lastMidnightDate = today;

  const duration = Date.now() - startTime;
  logger.info(`Midnight rollover completed in ${duration}ms — ${usersEvaluated} users evaluated, ${personalBroken} personal streaks broken, ${friendIncremented} friend streaks incremented, ${friendBroken} friend streaks broken, ${groupIncremented} group streaks incremented, ${groupBroken} group streaks broken`, { source: 'streaks' });
}

// ─── Startup Streak Integrity Check ───

/**
 * On server startup, verify all streak values are correct.
 * Backfills goalMet flags for existing records missing them.
 * Corrects any inconsistent streak values.
 */
async function startupStreakIntegrityCheck(io) {
  const startTime = Date.now();
  logger.info('Starting streak integrity check...', { source: 'streaks' });
  let corrections = 0;

  try {
    // Phase 1: Backfill goalMet for records that don't have it set
    const unsetRecords = await TrackingData.find({
      goalMet: { $exists: false },
    }).select('userId date seconds');

    // Also check records where goalMet is null/undefined (but field exists)
    const nullRecords = await TrackingData.find({
      goalMet: null,
      seconds: { $gt: 0 },
    }).select('userId date seconds');

    const toBackfill = [...unsetRecords, ...nullRecords];
    if (toBackfill.length > 0) {
      logger.info(`Backfilling goalMet for ${toBackfill.length} records...`, { source: 'streaks' });
      for (const record of toBackfill) {
        try {
          const offDay = await isOffDay(record.userId, record.date);
          if (offDay) {
            await TrackingData.updateOne({ _id: record._id }, { goalMet: false });
            continue;
          }
          const goalMinutes = await getEffectiveGoalMinutes(record.userId, record.date);
          const met = record.seconds >= goalMinutes * 60;
          await TrackingData.updateOne({ _id: record._id }, { goalMet: met });
        } catch { /* skip individual failures */ }
      }
      logger.info(`Backfill complete for ${toBackfill.length} records`, { source: 'streaks' });
    }

    // Phase 2: Verify personal streaks
    const allUsers = await User.find({ active: true }).select('userId currentStreak bestStreak');
    for (const user of allUsers) {
      try {
        const correctCurrent = await computePersonalStreak(user.userId);
        const correctBest = Math.max(user.bestStreak || 0, correctCurrent, await computeBestStreak(user.userId));

        if (correctCurrent !== (user.currentStreak || 0) || correctBest !== (user.bestStreak || 0)) {
          logger.warn(`Streak correction: user ${user.userId} — currentStreak ${user.currentStreak}→${correctCurrent}, bestStreak ${user.bestStreak}→${correctBest}`, { source: 'streaks' });
          await User.updateOne({ userId: user.userId }, { currentStreak: correctCurrent, bestStreak: correctBest });
          corrections++;

          if (io) {
            io.to(`user:${user.userId}`).emit('STREAK_UPDATE', { currentStreak: correctCurrent, bestStreak: correctBest });
          }
        }
      } catch (err) {
        logger.error(`Startup check failed for user ${user.userId}: ${err.message}`, { source: 'streaks' });
      }
    }

    // Phase 3: Verify friend streaks
    const allFriendStreaks = await FriendStreak.find({});
    for (const fs of allFriendStreaks) {
      try {
        const correctCurrent = await computeFriendStreak(fs.userA, fs.userB);
        const correctBest = Math.max(fs.bestStreak || 0, correctCurrent);

        if (correctCurrent !== (fs.currentStreak || 0) || correctBest !== (fs.bestStreak || 0)) {
          logger.warn(`Friend streak correction: ${fs.userA}/${fs.userB} — currentStreak ${fs.currentStreak}→${correctCurrent}, bestStreak ${fs.bestStreak}→${correctBest}`, { source: 'streaks' });
          fs.currentStreak = correctCurrent;
          fs.bestStreak = correctBest;
          await fs.save();
          corrections++;

          if (io) {
            const data = { currentStreak: correctCurrent, bestStreak: correctBest, userA: fs.userA, userB: fs.userB };
            io.to(`user:${fs.userA}`).emit('FRIEND_STREAK_UPDATE', data);
            io.to(`user:${fs.userB}`).emit('FRIEND_STREAK_UPDATE', data);
          }
        }
      } catch (err) {
        logger.error(`Startup friend streak check failed for ${fs.userA}/${fs.userB}: ${err.message}`, { source: 'streaks' });
      }
    }

    // Phase 4: Verify group streaks
    const allGroups = await Group.find({});
    for (const group of allGroups) {
      try {
        const memberIds = group.members.map(m => m.userId);
        if (memberIds.length === 0) continue;

        const correctCurrent = await computeGroupStreak(memberIds);
        const correctBest = Math.max(group.bestStreak || 0, correctCurrent);

        if (correctCurrent !== (group.currentStreak || 0) || correctBest !== (group.bestStreak || 0)) {
          logger.warn(`Group streak correction: ${group.groupId} "${group.name}" — currentStreak ${group.currentStreak}→${correctCurrent}, bestStreak ${group.bestStreak}→${correctBest}`, { source: 'streaks' });
          group.currentStreak = correctCurrent;
          group.bestStreak = correctBest;
          await group.save();
          corrections++;

          if (io) {
            const data = { groupId: group.groupId, currentStreak: correctCurrent, bestStreak: correctBest };
            for (const mid of memberIds) {
              io.to(`user:${mid}`).emit('GROUP_STREAK_UPDATE', data);
            }
          }
        }
      } catch (err) {
        logger.error(`Startup group streak check failed for ${group.groupId}: ${err.message}`, { source: 'streaks' });
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Streak integrity check completed in ${duration}ms — ${corrections} corrections made`, { source: 'streaks' });
    if (duration > 30000) {
      logger.warn(`Streak integrity check took ${duration}ms (>30s) — consider optimizing for large datasets`, { source: 'streaks' });
    }
  } catch (err) {
    logger.error(`Streak integrity check failed: ${err.message}`, { source: 'streaks' });
  }
}

/**
 * Compute friend streak by walking backward from yesterday.
 * Uses goalMet flags for efficiency.
 */
async function computeFriendStreak(userA, userB) {
  let count = 0;
  const today = dateStr(0);
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);

    const aOff = await isOffDay(userA, ds);
    const bOff = await isOffDay(userB, ds);
    if (aOff || bOff) continue;

    // Today is special — don't break if goal not met yet
    if (ds === today) {
      const aRec = await TrackingData.findOne({ userId: userA, date: ds }).select('goalMet').lean();
      const bRec = await TrackingData.findOne({ userId: userB, date: ds }).select('goalMet').lean();
      if (aRec?.goalMet && bRec?.goalMet) count++;
      continue;
    }

    const aRec = await TrackingData.findOne({ userId: userA, date: ds }).select('goalMet').lean();
    const bRec = await TrackingData.findOne({ userId: userB, date: ds }).select('goalMet').lean();
    if (aRec?.goalMet && bRec?.goalMet) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Compute group streak by walking backward from yesterday.
 */
async function computeGroupStreak(memberIds) {
  let count = 0;
  const today = dateStr(0);
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);

    let anyOff = false;
    for (const mid of memberIds) {
      if (await isOffDay(mid, ds)) { anyOff = true; break; }
    }
    if (anyOff) continue;

    let allMet = true;
    for (const mid of memberIds) {
      const rec = await TrackingData.findOne({ userId: mid, date: ds }).select('goalMet').lean();
      if (!rec?.goalMet) { allMet = false; break; }
    }

    if (ds === today) {
      if (allMet) count++;
      continue;
    }

    if (allMet) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Midnight Scheduler ───

let _midnightTimer = null;

/**
 * Schedule the midnight rollover job using setTimeout.
 * Re-schedules itself after each run.
 */
function scheduleMidnightJob(io) {
  if (_midnightTimer) clearTimeout(_midnightTimer);

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const delay = nextMidnight.getTime() - now.getTime();

  logger.info(`Midnight job scheduled in ${Math.round(delay / 1000)}s (at ${nextMidnight.toISOString()})`, { source: 'streaks' });

  _midnightTimer = setTimeout(async () => {
    try {
      await midnightRollover(io);
    } catch (err) {
      logger.error(`Midnight rollover failed: ${err.message}`, { source: 'streaks' });
    }
    // Re-schedule for next midnight
    scheduleMidnightJob(io);
  }, delay);
}

module.exports = {
  checkAndSetGoalMet,
  midnightRollover,
  startupStreakIntegrityCheck,
  scheduleMidnightJob,
  dateStr,
  streakPair,
};
