/**
 * Webhook delivery utility.
 * Fires async (fire-and-forget) HTTP POST requests to all registered webhook URLs
 * for a given user and event type. Payloads are signed with HMAC-SHA256.
 */

const crypto = require('crypto');
const Webhook = require('../models/Webhook');
const logger = require('./logger');

/**
 * Dispatch a webhook event to all matching, enabled webhooks for a user.
 *
 * @param {string} userId - The user whose webhooks to target.
 * @param {string} eventType - One of the supported event type strings.
 * @param {object} data - Event-specific payload data.
 */
async function dispatchWebhook(userId, eventType, data) {
  let webhooks;
  try {
    webhooks = await Webhook.find({ userId, enabled: true, events: eventType }).lean();
  } catch (err) {
    logger.warn(`webhookDispatch: failed to query webhooks for ${userId}: ${err.message}`, { source: 'webhook' });
    return;
  }

  if (!webhooks || webhooks.length === 0) return;

  const payload = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    userId,
    data,
  });

  for (const wh of webhooks) {
    const signature = crypto
      .createHmac('sha256', wh.secret)
      .update(payload)
      .digest('hex');

    // Fire and forget — 5-second timeout, no retries
    fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-StandupTracker-Signature': `sha256=${signature}`,
        'X-StandupTracker-Event': eventType,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        logger.debug(`Webhook delivered: ${eventType} → ${wh.url} (${res.status})`, { source: 'webhook', userId });
      })
      .catch((err) => {
        logger.warn(`Webhook delivery failed: ${eventType} → ${wh.url}: ${err.message}`, { source: 'webhook', userId });
      });
  }
}

module.exports = { dispatchWebhook };
