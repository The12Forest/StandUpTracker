# API Reference

Complete documentation for the StandUpTracker REST API and webhook system.

## Public API v1 (Programmatic Timer Control)

The `/api/v1` endpoints provide programmatic access to the timer without user interaction. All endpoints are **authenticated via API key** and **rate-limited to 60 requests per minute** per key.

### Authentication

#### Generate an API Key

1. Log in to the app
2. Go to **Settings → API Access → API Keys**
3. Click **+ New API Key**
4. Enter a name (e.g., "Home Assistant Integration")
5. Click **Create**
6. **Copy the secret immediately** — it is displayed only once and cannot be recovered

API keys are stored as SHA-256 hashes. The format is `sut_` followed by 32 hex characters. Example: `sut_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

#### Pass the API Key

Include the API key in one of two ways:

**Option 1: Bearer Token (Recommended)**
```bash
curl -H "Authorization: Bearer sut_a1b2c3d4..." https://api.example.com/api/v1/timer/status
```

**Option 2: Query Parameter**
```bash
curl https://api.example.com/api/v1/timer/status?api_key=sut_a1b2c3d4...
```

### Rate Limiting

All API v1 requests are rate-limited to **60 requests per minute** per API key.

**When rate limit is exceeded:**

Status: `429 Too Many Requests`

Response:
```json
{
  "error": "Rate limit exceeded",
  "retryAfterSeconds": 45,
  "limit": 60,
  "window": "1 minute"
}
```

Wait the indicated seconds before retrying.

---

### GET /api/v1/timer/status

Get the current timer state and today's total standing time.

**Method:** `GET`

**Path:** `/api/v1/timer/status`

**Authentication:** API Key (Bearer or query param)

**Request Parameters:** None

**Response (200 OK):**
```json
{
  "running": false,
  "startedAt": 1743638400000,
  "elapsedSeconds": 0,
  "todayTotalSeconds": 3600,
  "todayGoalSeconds": 3600,
  "todayGoalMet": true,
  "level": 5,
  "currentStreak": 12,
  "totalSeconds": 453600
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `running` | boolean | True if timer is currently active |
| `startedAt` | number | Unix timestamp (ms) when timer was started, null if not running |
| `elapsedSeconds` | number | Elapsed time since timer start (0 if not running) |
| `todayTotalSeconds` | number | Total standing seconds for today |
| `todayGoalSeconds` | number | User's standing goal for today (in seconds) |
| `todayGoalMet` | boolean | Whether today's goal has been reached |
| `level` | number | Current user level (1-10) |
| `currentStreak` | number | Current personal streak (days) |
| `totalSeconds` | number | Lifetime total standing seconds |

**Error Responses:**

- `401 Unauthorized` — Invalid, expired, or missing API key
- `503 Service Unavailable` — Database temporarily unavailable

**Example:**
```bash
curl -H "Authorization: Bearer sut_abcd1234..." https://api.example.com/api/v1/timer/status

# Response
{
  "running": true,
  "startedAt": 1743638400000,
  "elapsedSeconds": 125,
  "todayTotalSeconds": 1800,
  "todayGoalSeconds": 3600,
  "todayGoalMet": false,
  "level": 3,
  "currentStreak": 5,
  "totalSeconds": 180000
}
```

---

### GET /api/v1/timer/start

Start the timer for the current user.

**Method:** `GET`

**Path:** `/api/v1/timer/start`

**Authentication:** API Key (Bearer or query param)

**Request Parameters:** None

**Response (200 OK):**
```json
{
  "running": true,
  "startedAt": 1743638400000,
  "elapsedSeconds": 0,
  "todayTotalSeconds": 1800,
  "todayGoalSeconds": 3600,
  "message": "Timer started"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `running` | boolean | Always true after successful start |
| `startedAt` | number | Unix timestamp (ms) when timer was started |
| `elapsedSeconds` | number | Elapsed time since start (always 0 on success) |
| `todayTotalSeconds` | number | Total standing time before this session |
| `todayGoalSeconds` | number | User's standing goal for today |
| `message` | string | Confirmation message |

**Error Responses:**

- `401 Unauthorized` — Invalid or missing API key
- `400 Bad Request` — Timer already running, or user not email-verified
- `503 Service Unavailable` — Database temporarily unavailable

**Behavior:**

- Fails silently if timer is already running (idempotent)
- Only works for email-verified users
- Triggers webhook `timer.started` with `{ startedAt }`
- Broadcasts `TIMER_SYNC` to user's all devices via WebSocket

**Example:**
```bash
curl -H "Authorization: Bearer sut_abcd1234..." https://api.example.com/api/v1/timer/start

# Response
{
  "running": true,
  "startedAt": 1743638400000,
  "elapsedSeconds": 0,
  "todayTotalSeconds": 1800,
  "todayGoalSeconds": 3600,
  "message": "Timer started"
}
```

---

### GET /api/v1/timer/stop

Stop the timer and save the session.

**Method:** `GET`

**Path:** `/api/v1/timer/stop`

**Authentication:** API Key (Bearer or query param)

**Request Parameters:** None

**Response (200 OK):**
```json
{
  "running": false,
  "startedAt": null,
  "sessionSeconds": 600,
  "todayTotalSeconds": 2400,
  "todayGoalSeconds": 3600,
  "todayGoalMet": false,
  "level": 3,
  "currentStreak": 5,
  "message": "Timer stopped, session saved (10 minutes)"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `running` | boolean | Always false after successful stop |
| `startedAt` | null | Always null after stop |
| `sessionSeconds` | number | Duration of the session just completed |
| `todayTotalSeconds` | number | New total standing time for today |
| `todayGoalSeconds` | number | User's standing goal for today |
| `todayGoalMet` | boolean | Whether today's goal is now met |
| `level` | number | Current user level (may have increased) |
| `currentStreak` | number | Current streak (may have incremented) |
| `message` | string | Human-readable summary |

**Error Responses:**

- `401 Unauthorized` — Invalid or missing API key
- `400 Bad Request` — Timer not running, or user not email-verified
- `503 Service Unavailable` — Database temporarily unavailable

**Behavior:**

- Fails silently if timer is not running (idempotent)
- Only works for email-verified users
- Minimum session is 1 second; maximum 86400 seconds (24 hours)
- Recalculates all user stats (single source of truth)
- Triggers webhooks:
  - `timer.stopped` with `{ durationSeconds, todayTotalSeconds }`
  - `goal.reached` if goal was just met (with `{ minutes, todayTotalSeconds }`)
  - `streak.incremented` if streak increased
- Updates leaderboard rankings
- Broadcasts to all user devices via WebSocket

**Example:**
```bash
curl -H "Authorization: Bearer sut_abcd1234..." https://api.example.com/api/v1/timer/stop

# Response
{
  "running": false,
  "startedAt": null,
  "sessionSeconds": 600,
  "todayTotalSeconds": 2400,
  "todayGoalSeconds": 3600,
  "todayGoalMet": false,
  "level": 3,
  "currentStreak": 5,
  "message": "Timer stopped, session saved (10 minutes)"
}
```

---

## Webhooks

Webhooks allow you to subscribe to events in StandUpTracker and receive HTTP POST callbacks whenever those events occur. Each webhook is signed with an HMAC-SHA256 signature to verify authenticity.

### Registration

1. Log in to the app
2. Go to **Settings → API Access → Webhooks**
3. Click **+ New Webhook**
4. Enter:
   - **Name:** A descriptive name (e.g., "Discord Notifications")
   - **URL:** The HTTPS endpoint that will receive the POST requests
   - **Events:** Check the event types you want to subscribe to
5. Click **Create**
6. **Copy the secret immediately** — it is displayed only once and cannot be recovered

**Limits:**
- Maximum 5 webhooks per user
- URLs must be publicly accessible HTTPS endpoints
- Webhook secret format: `whsec_` followed by 48 hex characters

### Payload Structure

All webhook payloads have this structure:

```json
{
  "event": "timer.started",
  "timestamp": "2026-04-02T14:30:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "startedAt": "2026-04-02T14:30:00.000Z"
  }
}
```

**Payload Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event type (one of the 6 supported types) |
| `timestamp` | string | ISO 8601 timestamp when event occurred |
| `userId` | string | UUID of the user who triggered the event |
| `data` | object | Event-specific payload (see event-specific schemas below) |

### Supported Events

#### timer.started

Fired when a user starts the timer (via app or API).

**Trigger:** After `TIMER_START` event in WebSocket handler or API endpoint

**Data Schema:**
```json
{
  "startedAt": "2026-04-02T14:30:00.000Z"
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `startedAt` | string | ISO 8601 timestamp when timer was started |

**Example Payload:**
```json
{
  "event": "timer.started",
  "timestamp": "2026-04-02T14:30:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "startedAt": "2026-04-02T14:30:00.000Z"
  }
}
```

---

#### timer.stopped

Fired when a user stops the timer and the session is saved.

**Trigger:** After tracking data is saved in `TIMER_STOP` handler

**Data Schema:**
```json
{
  "durationSeconds": 600,
  "todayTotalSeconds": 2400
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `durationSeconds` | number | Duration of the session just completed (seconds) |
| `todayTotalSeconds` | number | User's new total standing time for today |

**Example Payload:**
```json
{
  "event": "timer.stopped",
  "timestamp": "2026-04-02T14:40:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "durationSeconds": 600,
    "todayTotalSeconds": 2400
  }
}
```

---

#### goal.reached

Fired when a user reaches their daily standing goal for the first time today.

**Trigger:** During `TIMER_STOP` when `todayTotalSeconds >= goalSeconds` and previous total was below goal

**Data Schema:**
```json
{
  "minutes": 60,
  "todayTotalSeconds": 3600
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `minutes` | number | User's daily goal (in minutes) |
| `todayTotalSeconds` | number | Total standing time when goal was reached |

**Example Payload:**
```json
{
  "event": "goal.reached",
  "timestamp": "2026-04-02T15:00:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "minutes": 60,
    "todayTotalSeconds": 3600
  }
}
```

---

#### streak.incremented

Fired when a user's personal streak increases (usually at the end of a day when the goal is met).

**Trigger:** In `recalcPersonalStreak()` when `currentStreak > oldCurrent`

**Data Schema:**
```json
{
  "currentStreak": 15,
  "previousStreak": 14
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `currentStreak` | number | New streak count (days) |
| `previousStreak` | number | Previous streak count |

**Example Payload:**
```json
{
  "event": "streak.incremented",
  "timestamp": "2026-04-03T00:15:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "currentStreak": 15,
    "previousStreak": 14
  }
}
```

---

#### streak.broken

Fired when a user's personal streak is reset to 0 (usually at midnight if they missed the previous day's goal).

**Trigger:** In `midnightRollover()` when streak is reset to 0

**Data Schema:**
```json
{
  "previousStreak": 12
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `previousStreak` | number | Streak count before it was broken |

**Example Payload:**
```json
{
  "event": "streak.broken",
  "timestamp": "2026-04-03T00:00:15.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "previousStreak": 12
  }
}
```

---

#### friend_request.received

Fired when a user receives an incoming friend request.

**Trigger:** When sender creates a friend request via `POST /api/social/request`

**Data Schema:**
```json
{
  "fromUserId": "12345678-1234-1234-1234-123456789012",
  "fromUsername": "alice"
}
```

**Data Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `fromUserId` | string | UUID of the user sending the request |
| `fromUsername` | string | Username of the requester |

**Example Payload:**
```json
{
  "event": "friend_request.received",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "fromUserId": "12345678-1234-1234-1234-123456789012",
    "fromUsername": "alice"
  }
}
```

---

### Signature Verification

Every webhook request includes an `X-StandupTracker-Signature` header containing an HMAC-SHA256 signature of the request body. **Always verify this signature** to ensure the request is authentic.

**Header Format:**
```
X-StandupTracker-Signature: sha256=<40-character hex string>
```

**Verification Process:**

1. Extract the signature from the header
2. Hash the raw request body using your webhook secret and HMAC-SHA256
3. Compare (constant-time) with the signature from the header
4. Reject if they don't match

#### Node.js Example

```javascript
const crypto = require('crypto');
const express = require('express');

const app = express();
app.use(express.json());

const SECRET = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'; // Your webhook secret

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-standuptracker-signature'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing signature header' });
  }

  // Get the raw body as a string
  const rawBody = JSON.stringify(req.body);

  // Calculate expected signature
  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', SECRET)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    // Signature is valid, process the webhook
    console.log('Webhook received:', req.body.event);
    res.status(200).json({ received: true });
  } else {
    // Signature is invalid
    res.status(401).json({ error: 'Invalid signature' });
  }
});

app.listen(3001, () => {
  console.log('Webhook receiver listening on port 3001');
});
```

#### Python Example

```python
import hmac
import hashlib
import json
from flask import Flask, request

app = Flask(__name__)

SECRET = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'  # Your webhook secret

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-StandupTracker-Signature')

    if not signature:
        return {'error': 'Missing signature header'}, 401

    # Get the raw body as bytes
    raw_body = request.get_data()

    # Calculate expected signature
    expected_sig = 'sha256=' + hmac.new(
        SECRET.encode(),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Constant-time comparison
    if hmac.compare_digest(signature, expected_sig):
        # Signature is valid, process the webhook
        payload = request.get_json()
        print(f'Webhook received: {payload["event"]}')
        return {'received': True}, 200
    else:
        # Signature is invalid
        return {'error': 'Invalid signature'}, 401

if __name__ == '__main__':
    app.run(port=3001)
```

### Delivery Behavior

**Reliability:**
- Webhooks are delivered asynchronously (fire-and-forget)
- Each webhook call has a 5-second timeout
- Failed requests are logged server-side but **NOT retried**
- Implement idempotency on your endpoint to handle duplicate deliveries

**HTTP Headers:**
Every webhook request includes these headers:
```
Content-Type: application/json
X-StandupTracker-Signature: sha256=<hex>
X-StandupTracker-Event: timer.started
```

**Expected Response:**
Return HTTP 2xx status code to acknowledge receipt. Any other status is logged as a failure (but will not be retried).

**Disabled Webhooks:**
Webhooks can be disabled from the Settings UI. Disabled webhooks will not receive events.

### Secret Rotation

Your webhook secret is shown **only once** at creation. If you believe your secret has been compromised:

1. Go to **Settings → Webhooks**
2. Delete the compromised webhook
3. Create a new webhook with the same URL
4. Update your endpoint with the new secret

---

## REST API — Other Endpoints

For documentation of other REST API endpoints (auth, tracking, admin, social, groups, leaderboard, notifications, etc.), see the main README or your API documentation tool.

## Home Assistant Example

```YAML
# Pull timer state every 30 seconds
rest:
  - resource: https://standuptracker.wnw.li/api/v1/timer/status
    headers:
      Authorization: Bearer sut_1fc59868331a6567cb17e74ce3ef9444ad89c108
    scan_interval: 30
    sensor:
      - name: "StandUpTracker Status"
        unique_id: standuptracker_status
        value_template: "{{ value_json.running }}"
        icon: >
          {% if value_json.running %} mdi:run {% else %} mdi:pause {% endif %}
        json_attributes:
          - todayTotalSeconds
          - todayGoalSeconds
          - todayGoalMet
          - currentStreak
          - level

      - name: "StandUpTracker Total Time"
        unique_id: standuptracker_total_seconds
        value_template: "{{ (value_json.todayTotalSeconds / 60) | round(1) }}"
        unit_of_measurement: "min"
        device_class: duration
        icon: mdi:timer-outline

      - name: "StandUpTracker Goal"
        unique_id: standuptracker_goal_seconds
        value_template: "{{ (value_json.todayGoalSeconds / 60) | round(0) }}"
        unit_of_measurement: "min"
        icon: mdi:flag-checkered

# Commands to start/stop the timer
rest_command:
  standuptracker_start:
    url: https://standuptracker.wnw.li/api/v1/timer/start
    method: GET
    headers:
      Authorization: Bearer sut_1fc59868331a6567cb17e74ce3ef9444ad89c108

  standuptracker_stop:
    url: https://standuptracker.wnw.li/api/v1/timer/stop
    method: GET
    headers:
      Authorization: Bearer sut_1fc59868331a6567cb17e74ce3ef9444ad89c108

# Template switch that ties it all together
template:
  - switch:
      - name: "StandUpTracker"
        unique_id: standuptracker_switch
        icon: mdi:human-queue
        state: "{{ states('sensor.standuptracker_status') == 'True' }}"
        turn_on:
          action: rest_command.standuptracker_start
        turn_off:
          action: rest_command.standuptracker_stop
  - sensor:
      - name: "StandUpTracker Standing Time Remaining"
        unit_of_measurement: "min"
        state: >
          {% set total = states('sensor.standuptracker_total_seconds') | float(0) %}
          {% set goal = states('sensor.standuptracker_goal_seconds') | float(0) %}
          {{ [0, (goal - total)] | max | round(1) }}
```
