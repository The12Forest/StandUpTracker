const Notification = require('../models/Notification');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');
const logger = require('./logger');
const { getEffectiveGoalMinutes, isOffDay } = require('./settings');
const { sendPushNotification } = require('./pushSender');

/**
 * Runs periodically (e.g. every hour) to create scheduled notifications:
 * - standup_reminder: if user hasn't tracked anything today by noon-ish
 * - streak_at_risk: if user's streak > 0 and they haven't met goal today with < 4 hours left in the day
 * Off days are skipped — no reminders or streak warnings sent.
 */
async function runNotificationScheduler(io) {
  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const todayStr = now.toISOString().slice(0, 10);

    const users = await User.find({ active: true }).select('userId dailyGoalMinutes currentStreak pushEnabled standupReminderTime');

    for (const user of users) {
      // Skip notifications for off days
      if (await isOffDay(user.userId, todayStr)) continue;

      const effectiveGoal = await getEffectiveGoalMinutes(user, todayStr);
      const goalSeconds = effectiveGoal * 60;
      const tracking = await TrackingData.findOne({ userId: user.userId, date: todayStr });
      const todaySeconds = tracking?.seconds || 0;

      // Standup reminder — send once per day at the user's preferred hour (default 12 UTC) if zero tracked
      const reminderHour = user.standupReminderTime ? parseInt(user.standupReminderTime.split(':')[0], 10) : 12;
      if (hour >= reminderHour && hour < reminderHour + 1 && todaySeconds === 0) {
        const existing = await Notification.findOne({
          userId: user.userId,
          type: 'standup_reminder',
          createdAt: { $gte: new Date(todayStr + 'T00:00:00Z') },
        });
        if (!existing) {
          const notif = await Notification.create({
            userId: user.userId,
            type: 'standup_reminder',
            title: 'Time to Stand Up!',
            message: "You haven't tracked any standing time today. Start a session to keep your streak going!",
          });
          if (io) io.to(`user:${user.userId}`).emit('NOTIFICATION', notif.toObject());
          sendPushNotification(user.userId, 'standup_reminder', {
            title: 'StandUpTracker',
            body: notif.message,
          }).catch(() => {});
        }
      }

      // Streak at risk — send once per day around evening (20-21 UTC) if streak > 0 and goal not met
      if (hour >= 20 && hour < 21 && user.currentStreak > 0 && todaySeconds < goalSeconds) {
        const existing = await Notification.findOne({
          userId: user.userId,
          type: 'streak_at_risk',
          createdAt: { $gte: new Date(todayStr + 'T00:00:00Z') },
        });
        if (!existing) {
          const remaining = Math.ceil((goalSeconds - todaySeconds) / 60);
          const notif = await Notification.create({
            userId: user.userId,
            type: 'streak_at_risk',
            title: 'Streak at Risk!',
            message: `Your ${user.currentStreak}-day streak is at risk! You need ${remaining} more minutes today.`,
            data: { streakDays: user.currentStreak, remainingMinutes: remaining },
          });
          if (io) io.to(`user:${user.userId}`).emit('NOTIFICATION', notif.toObject());
          sendPushNotification(user.userId, 'streak_at_risk', {
            title: 'StandUpTracker',
            body: notif.message,
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.warn('Notification scheduler error: ' + err.message, { source: 'scheduler' });
  }
}

module.exports = { runNotificationScheduler };
