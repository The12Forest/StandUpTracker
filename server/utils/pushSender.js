const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const logger = require('./logger');
const { getSetting } = require('./settings');

let vapidConfigured = false;

async function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  try {
    const publicKey = await getSetting('vapidPublicKey');
    const privateKey = await getSetting('vapidPrivateKey');
    const contactEmail = await getSetting('vapidContactEmail');
    if (!publicKey || !privateKey) return false;

    webpush.setVapidDetails(
      contactEmail || 'mailto:admin@example.com',
      publicKey,
      privateKey
    );
    vapidConfigured = true;
    return true;
  } catch {
    return false;
  }
}

// Reset cached VAPID config (call when keys change)
function resetVapidConfig() {
  vapidConfigured = false;
}

/**
 * Send a push notification to a user for a given notification type.
 * Respects user push preferences. Cleans up expired subscriptions.
 *
 * @param {string} userId
 * @param {string} type - notification type (e.g. 'standup_reminder', 'level_up')
 * @param {object} payload - { title, body, icon?, url? }
 */
async function sendPushNotification(userId, type, payload) {
  try {
    if (!(await ensureVapidConfigured())) return;

    // Check user has push enabled and this type enabled
    const user = await User.findOne({ userId })
      .select('pushEnabled pushPreferences');
    if (!user?.pushEnabled) return;

    // Check per-type preference
    if (user.pushPreferences && user.pushPreferences[type] === false) return;

    const subscriptions = await PushSubscription.find({ userId });
    if (subscriptions.length === 0) return;

    const pushPayload = JSON.stringify({
      title: payload.title || 'StandUpTracker',
      body: payload.body || '',
      icon: payload.icon || '/favicon.png',
      url: payload.url || '/dashboard',
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          pushPayload
        ).catch(async (err) => {
          // 410 Gone or 404 means subscription expired — clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.deleteOne({ _id: sub._id });
            logger.debug(`Removed expired push subscription for ${userId}`, { source: 'push' });
          }
          throw err;
        })
      )
    );

    // If all subscriptions failed, disable push on user
    const allFailed = results.every(r => r.status === 'rejected');
    if (allFailed && subscriptions.length > 0) {
      const remaining = await PushSubscription.countDocuments({ userId });
      if (remaining === 0) {
        await User.updateOne({ userId }, { $set: { pushEnabled: false } });
        logger.info(`Disabled push for ${userId} — all subscriptions expired`, { source: 'push' });
      }
    }
  } catch (err) {
    logger.warn('Push notification error: ' + err.message, { source: 'push' });
  }
}

module.exports = { sendPushNotification, resetVapidConfig };
