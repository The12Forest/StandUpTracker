const User = require('../models/User');

// Notification types that always bypass the daily limit (critical admin alerts)
const CRITICAL_TYPES = new Set(['report_cleared', 'admin_report_alert']);

/**
 * Parse "HH:MM" string to total minutes since midnight.
 */
function parseHHMM(str) {
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null;
  const [h, m] = str.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Check if the current UTC time falls within the quiet window.
 * Supports overnight ranges (e.g. from=22:00, until=07:00 wraps across midnight).
 * If from === until, quiet hours cover the entire day → always quiet.
 */
function isInQuietHours(fromStr, untilStr) {
  const from = parseHHMM(fromStr);
  const until = parseHHMM(untilStr);
  if (from === null || until === null) return false;

  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (from === until) return true; // entire day is quiet

  if (from < until) {
    // Same-day range: e.g. 08:00–16:00
    return nowMinutes >= from && nowMinutes < until;
  }
  // Overnight range: e.g. 22:00–07:00
  return nowMinutes >= from || nowMinutes < until;
}

/**
 * Get the non-quiet window boundaries in minutes since midnight.
 * Returns { activeFrom, activeTo } where activeFrom < activeTo (in logical terms).
 * For overnight quiet (22:00–07:00), active is 07:00–22:00 → { activeFrom: 420, activeTo: 1320 }.
 * Returns null if quiet covers entire day.
 */
function getActiveWindow(fromStr, untilStr) {
  const from = parseHHMM(fromStr);
  const until = parseHHMM(untilStr);
  if (from === null || until === null) return { activeFrom: 0, activeTo: 1440 };
  if (from === until) return null; // entire day quiet

  // Active window = quiet_until → quiet_from
  return { activeFrom: until, activeTo: from <= until ? from + 1440 : from };
}

/**
 * Compute the standup reminder hour — midpoint of the active (non-quiet) window.
 * Falls back to 9 (09:00 UTC) if ambiguous.
 */
function getReminderHour(fromStr, untilStr) {
  const win = getActiveWindow(fromStr, untilStr);
  if (!win) return -1; // entire day quiet, skip reminder
  const mid = Math.floor((win.activeFrom + win.activeTo) / 2) % 1440;
  return Math.floor(mid / 60);
}

/**
 * Compute the streak-at-risk notification hour — last 2 hours of the active window.
 * Returns the start hour of the 2-hour window.
 */
function getStreakAtRiskHour(fromStr, untilStr) {
  const win = getActiveWindow(fromStr, untilStr);
  if (!win) return -1;
  const durationMinutes = win.activeTo - win.activeFrom;
  if (durationMinutes < 120) return -1; // active window too short
  const riskStart = (win.activeTo - 120) % 1440;
  return Math.floor(riskStart / 60);
}

/**
 * Check if a notification should be allowed for a user.
 * Checks quiet hours and daily notification count.
 * If allowed, atomically increments the daily count.
 *
 * @param {string} userId
 * @param {string} notificationType
 * @returns {Promise<boolean>} true if notification should be dispatched
 */
async function shouldDispatchNotification(userId, notificationType) {
  const user = await User.findOne({ userId }).select(
    'quietHoursFrom quietHoursUntil maxNotificationsPerDay notificationCountToday notificationCountDate'
  );
  if (!user) return false;

  const isCritical = CRITICAL_TYPES.has(notificationType);

  // Check quiet hours (critical alerts also respect quiet hours per spec)
  if (isInQuietHours(user.quietHoursFrom || '22:00', user.quietHoursUntil || '07:00')) {
    return false;
  }

  // Critical alerts bypass the daily count limit
  if (isCritical) {
    return true;
  }

  // Check daily limit (0 = unlimited)
  const maxPerDay = user.maxNotificationsPerDay ?? 3;
  if (maxPerDay === 0) return true; // unlimited

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentCount = user.notificationCountDate === todayStr ? (user.notificationCountToday || 0) : 0;

  if (currentCount >= maxPerDay) {
    return false;
  }

  return true;
}

/**
 * Increment the daily notification count for a user.
 * Should be called after successfully dispatching a notification.
 */
async function incrementNotificationCount(userId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  await User.updateOne(
    { userId },
    [
      {
        $set: {
          notificationCountToday: {
            $cond: {
              if: { $eq: ['$notificationCountDate', todayStr] },
              then: { $add: ['$notificationCountToday', 1] },
              else: 1,
            },
          },
          notificationCountDate: todayStr,
        },
      },
    ]
  );
}

/**
 * Reset daily notification counts for all users.
 * Call this from the midnight rollover job.
 */
async function resetDailyNotificationCounts() {
  await User.updateMany({}, { $set: { notificationCountToday: 0, notificationCountDate: '' } });
}

module.exports = {
  isInQuietHours,
  getActiveWindow,
  getReminderHour,
  getStreakAtRiskHour,
  shouldDispatchNotification,
  incrementNotificationCount,
  resetDailyNotificationCounts,
  parseHHMM,
  CRITICAL_TYPES,
};
