# server/models/Friendship.js

## File Overview

**File path:** `server/models/Friendship.js`

Defines the Mongoose model representing a directional friendship record. A pending request is stored with the sender as `requester` and the receiver as `recipient`. On acceptance the `status` changes to `'accepted'` and `acceptedAt` is recorded. The `'blocked'` status prevents new requests from either party.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `Friendship` model and its indexes.

---

## Classes & Models

### `Friendship`

**Collection name:** `friendships`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `requester` | `String` | Yes | — | userId of the user who sent the friend request |
| `recipient` | `String` | Yes | — | userId of the user who received the friend request |
| `status` | `String` (enum) | No | `'pending'` | One of `'pending'`, `'accepted'`, `'blocked'` |
| `acceptedAt` | `Date` | No | — | Timestamp of acceptance |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `requester` | — | Fast lookup of all requests sent by a user |
| Single | `recipient` | — | Fast lookup of all requests received by a user |
| Compound | `(requester, recipient)` | unique | Prevents duplicate requests between the same pair |
| Compound | `(recipient, status)` | — | Efficient query for pending requests to a user |

---

## Exports

```js
module.exports = mongoose.model('Friendship', friendshipSchema);
```

Used by `server/routes/social.js` and `server/socket/handler.js`.

---

## Known Issues & Technical Debt

- The `'blocked'` status only prevents the sender from sending a new request. The blocked state is stored on the original directional record. A `blocked` record from user A to B does not prevent user B from creating a new request to A using a different direction. Logic in the route handles this with a bidirectional check but it relies on application-level enforcement.
