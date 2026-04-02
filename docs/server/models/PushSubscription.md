# server/models/PushSubscription.js

## File Overview

**File path:** `server/models/PushSubscription.js`

Defines the Mongoose model for Web Push subscription objects. Each document stores a browser push subscription endpoint and encryption keys for one browser/device of one user. A user can have multiple subscriptions (across devices). The endpoint is unique per user but not globally unique (different users cannot share an endpoint in practice, but the schema does not enforce global uniqueness).

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `PushSubscription` model and its compound index.

---

## Classes & Models

### `PushSubscription`

**Collection name:** `pushsubscriptions`

| Property | Type | Required | Description |
|---|---|---|---|
| `userId` | `String` | Yes | UUID of the user this subscription belongs to |
| `endpoint` | `String` | Yes | The push service URL (browser-provided, unique per browser profile) |
| `keys.p256dh` | `String` | Yes | ECDH public key for encrypting push message content |
| `keys.auth` | `String` | Yes | Authentication secret |
| `userAgent` | `String` | No | Browser user-agent string for display purposes |
| `createdAt` | `Date` | Auto | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Compound | `(userId, endpoint)` | unique | Prevent duplicate subscriptions for the same endpoint per user |

---

## Exports

```js
module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
```

Used by `server/routes/notifications.js` (subscribe/unsubscribe) and `server/utils/pushSender.js` (delivery).

---

## Known Issues & Technical Debt

- Expired subscriptions (HTTP 410/404 responses from push services) are cleaned up lazily by `pushSender.js` only when a push attempt fails. There is no proactive sweep to remove stale subscriptions.
