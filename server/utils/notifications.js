const Notification = require('../models/Notification');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');
const logger = require('./logger');
const { getEffectiveGoalMinutes, isOffDay } = require('./settings');
const { sendPushNotification } = require('./pushSender');
const {
  shouldDispatchNotification,
  incrementNotificationCount,
  getReminderHour,
  getStreakAtRiskHour,
} = require('./notificationGate');

/**
 * Runs periodically (every hour) to create scheduled notifications:
 * - standup_reminder: once/day at midpoint of non-quiet window, if zero tracked
 * - streak_at_risk: once/day in last 2h of non-quiet window, if streak > 0 and goal not met
 * Respects quiet hours and daily notification limits.
 * Off days are skipped.
 */
async function runNotificationScheduler(io) {
  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const todayStr = now.toISOString().slice(0, 10);

    const users = await User.find({ active: true }).select(
      'userId dailyGoalMinutes currentStreak pushEnabled quietHoursFrom quietHoursUntil maxNotificationsPerDay notificationCountToday notificationCountDate'
    );

    for (const user of users) {
      // Skip notifications for off days
      if (await isOffDay(user.userId, todayStr)) continue;

      const qFrom = user.quietHoursFrom || '22:00';
      const qUntil = user.quietHoursUntil || '07:00';

      // --- Standup Reminder ---
      const reminderHour = getReminderHour(qFrom, qUntil);
      if (reminderHour >= 0 && hour >= reminderHour && hour < reminderHour + 1) {
        const tracking = await TrackingData.findOne({ userId: user.userId, date: todayStr });
        const todaySeconds = tracking?.seconds || 0;

        if (todaySeconds === 0) {
          const existing = await Notification.findOne({
            userId: user.userId,
            type: 'standup_reminder',
            createdAt: { $gte: new Date(todayStr + 'T00:00:00Z') },
          });
          if (!existing) {
            const allowed = await shouldDispatchNotification(user.userId, 'standup_reminder');
            if (allowed) {
              const notif = await Notification.create({
                userId: user.userId,
                type: 'standup_reminder',
                title: 'Time to Stand Up!',
                message: "You haven't tracked any standing time today. Start a session to keep your streak going!",
              });
              await incrementNotificationCount(user.userId);
              if (io) io.to(`user:${user.userId}`).emit('NOTIFICATION', notif.toObject());
              sendPushNotification(user.userId, 'standup_reminder', {
                title: 'StandUpTracker',
                body: notif.message,
              }).catch(() => {});
            }
          }
        }
      }

      // --- Streak at Risk ---
      const riskHour = getStreakAtRiskHour(qFrom, qUntil);
      if (riskHour >= 0 && hour >= riskHour && hour < riskHour + 2 && user.currentStreak > 0) {
        const effectiveGoal = await getEffectiveGoalMinutes(user, todayStr);
        const goalSeconds = effectiveGoal * 60;
        const tracking = await TrackingData.findOne({ userId: user.userId, date: todayStr });
        const todaySeconds = tracking?.seconds || 0;

        if (todaySeconds < goalSeconds) {
          const existing = await Notification.findOne({
            userId: user.userId,
            type: 'streak_at_risk',
            createdAt: { $gte: new Date(todayStr + 'T00:00:00Z') },
          });
          if (!existing) {
            const allowed = await shouldDispatchNotification(user.userId, 'streak_at_risk');
            if (allowed) {
              const remaining = Math.ceil((goalSeconds - todaySeconds) / 60);
              const notif = await Notification.create({
                userId: user.userId,
                type: 'streak_at_risk',
                title: 'Streak at Risk!',
                message: `Your ${user.currentStreak}-day streak is at risk! You need ${remaining} more minutes today.`,
                data: { streakDays: user.currentStreak, remainingMinutes: remaining },
              });
              await incrementNotificationCount(user.userId);
              if (io) io.to(`user:${user.userId}`).emit('NOTIFICATION', notif.toObject());
              sendPushNotification(user.userId, 'streak_at_risk', {
                title: 'StandUpTracker',
                body: notif.message,
              }).catch(() => {});
            }
          }
        }
      }
    }
  } catch (err) {
    logger.warn('Notification scheduler error: ' + err.message, { source: 'scheduler' });
  }
}

module.exports = { runNotificationScheduler };
