# Technical Documentation

This guide covers local development, architecture, deployment, and contributing to StandUpTracker.

## Requirements

- **Node.js** ≥ 20.0 (for both backend and frontend)
- **npm** ≥ 9.0
- **MongoDB** ≥ 7.0 (local or via Docker)
- **Git** (for cloning and contributing)
- **Optional: Ollama** (for AI advisor feature; can be added later via Admin Settings)
- **Optional: Docker & Docker Compose** (for containerized deployment)

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/the12forest/standuptracker.git
cd standuptracker
```

### 2. Install Backend Dependencies

```bash
npm install
```

### 3. Start MongoDB

**Option A: Via Docker**
```bash
docker run -d --name standuptracker-mongo -p 27017:27017 -v mongo-data:/data/db mongo:7
```

**Option B: Via native MongoDB** (if installed locally)
```bash
mongod --dbpath /path/to/data
```

### 4. Set Environment Variables

Create a `.env` file in the project root (or export in your shell):
```
MONGO_URI=mongodb://localhost:27017/standuptracker
```

### 5. Start the Backend (Dev Mode with Hot Reload)

```bash
npm run dev
```

The backend will start on `http://localhost:3000` with auto-reload via nodemon.

### 6. Start the Frontend (Separate Terminal)

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173` and automatically proxy `/api` requests to the backend.

### 7. First Launch

Open **http://localhost:5173** in your browser. The app will redirect to `/setup` where you can:
1. Configure SMTP (leave blank to skip email features during testing)
2. Set App URL to `http://localhost:5173`
3. Create the initial super_admin account

Then navigate to `/admin` to access the admin dashboard and further configure the app.

## Native Production Run (Without Docker)

### Build Frontend

```bash
cd frontend
npm run build
```

This generates optimized static files in `frontend/dist/`.

### Start Backend in Production

```bash
npm start
```

The backend will:
- Serve the built frontend from `frontend/dist` or `public`
- Listen on port 3000 (configurable via Admin Settings)
- Expect MongoDB at the connection string in `MONGO_URI`

Visit **http://localhost:3000** to access the app.

## Docker Manual Run

### Pull and Run

```bash
docker pull ghcr.io/the12forest/standuptracker:latest

docker run -d \
  --name standuptracker \
  -p 3000:3000 \
  -e MONGO_URI=mongodb://mongo:27017/standuptracker \
  --network standuptracker-net \
  ghcr.io/the12forest/standuptracker:latest

docker run -d \
  --name standuptracker-mongo \
  --network standuptracker-net \
  -v mongo-data:/data/db \
  mongo:7
```

Then access the app at **http://localhost:3000**.

## Build and Publish

### Build the Docker Image Locally

```bash
docker build -t ghcr.io/the12forest/standuptracker:latest .
```

The multi-stage Dockerfile:
- **Stage 1:** Builds the frontend with Vite
- **Stage 2:** Installs backend dependencies and serves both frontend and API

### Push to Container Registry

```bash
# Log in to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag for release (semantic versioning recommended)
docker tag ghcr.io/the12forest/standuptracker:latest ghcr.io/the12forest/standuptracker:v1.2.3

# Push both tags
docker push ghcr.io/the12forest/standuptracker:latest
docker push ghcr.io/the12forest/standuptracker:v1.2.3
```

### Automated Publishing via GitHub Actions

The repository can include a `.github/workflows/publish.yml` that:
- Triggers on push to `main` or on git tag
- Builds the Docker image
- Pushes to `ghcr.io/the12forest/standuptracker:latest` and tagged versions

## Project Directory Structure

```
standuptracker/
├── server/                        # Backend (Express + Socket.io)
│   ├── index.js                   # Entry point: sets up Express, Socket.io, routes, SPA fallback
│   ├── config.js                  # DB-backed configuration with env fallbacks
│   ├── models/                    # Mongoose schemas
│   │   ├── User.js                # User accounts, roles, timer state, stats, 2FA
│   │   ├── TrackingData.js        # Daily tracking records (seconds, sessions, goalMet)
│   │   ├── Session.js             # JWT sessions with TTL index
│   │   ├── ApiKey.js              # API credentials (keyHash, prefix, userId)
│   │   ├── Webhook.js             # Webhook subscriptions (url, events, secret)
│   │   ├── Friendship.js          # Friend requests and accepted friendships
│   │   ├── FriendStreak.js        # Shared streaks between friend pairs
│   │   ├── Group.js               # User groups with members and collective streaks
│   │   ├── DailyGoalOverride.js   # Per-user per-day goal overrides
│   │   ├── OffDay.js              # Days marked as off (don't break streaks)
│   │   ├── Notification.js        # In-app notifications
│   │   ├── AuditLog.js            # Admin actions (365-day TTL)
│   │   ├── AiAdviceCache.js       # Cached AI productivity tips
│   │   ├── Log.js                 # Server logs (app, errors, etc.)
│   │   └── Settings.js            # Global DB-backed config (key-value)
│   ├── routes/                    # REST API route handlers
│   │   ├── auth.js                # Auth, 2FA, API keys, webhooks
│   │   ├── api.js                 # Timer, tracking, stats
│   │   ├── admin.js               # Admin endpoints
│   │   ├── social.js              # Friend requests, friend streaks
│   │   ├── groups.js              # Group management
│   │   ├── leaderboard.js         # Public leaderboard
│   │   ├── ai.js                  # AI advice endpoints
│   │   ├── notifications.js       # Notification endpoints
│   │   ├── onboarding.js          # Setup wizard
│   │   ├── reports.js             # Stats and reports
│   │   ├── scheduler.js           # Scheduled tasks
│   │   └── publicApi.js           # Public /api/v1 endpoints (rate-limited)
│   ├── socket/                    # WebSocket event handlers
│   │   └── handler.js             # Socket.io connection, timer, counter, notifications
│   ├── middleware/                # Express middleware
│   │   ├── auth.js                # JWT authentication, API key auth
│   │   └── guards.js              # Authorization checks (roles, bans, impersonation, etc.)
│   └── utils/                     # Utilities
│       ├── logger.js              # Logging with structured output
│       ├── settings.js            # DB settings with 15s cache
│       ├── streaks.js             # Streak computation and midnight rollover
│       ├── recalcStats.js         # User stats recalculation (single source of truth)
│       ├── pushSender.js          # Web Push notifications
│       ├── webhookDispatch.js     # Webhook HTTP POST delivery
│       ├── notifications.js       # Notification scheduling
│       └── totp.js                # TOTP 2FA code generation/verification
├── frontend/                      # Frontend (React + Vite)
│   ├── src/
│   │   ├── pages/                 # Route-level React components
│   │   │   ├── LoginPage.jsx      # Login/register forms
│   │   │   ├── DashboardPage.jsx  # Main dashboard with heatmap
│   │   │   ├── StreaksPage.jsx    # Personal streak display
│   │   │   ├── SocialPage.jsx     # Friend requests and friends list
│   │   │   ├── SchedulerPage.jsx  # Weekly task scheduler
│   │   │   ├── LeaderboardPage.jsx# Public leaderboard
│   │   │   ├── GroupsPage.jsx     # Group management
│   │   │   ├── SettingsPage.jsx   # User settings, API keys, webhooks
│   │   │   ├── AdminPage.jsx      # Admin dashboard
│   │   │   ├── SetupPage.jsx      # Onboarding wizard
│   │   │   └── ...                # Other pages
│   │   ├── components/            # Reusable UI components
│   │   │   ├── GitHubHeatmap.jsx  # 52-week activity heatmap
│   │   │   ├── Chart.jsx          # Chart.js wrapper
│   │   │   ├── Timer.jsx          # Timer UI component
│   │   │   └── ...                # Other components
│   │   ├── stores/                # Zustand state management
│   │   │   ├── useAuthStore.js    # User auth state, token management
│   │   │   ├── useSocketStore.js  # WebSocket connection and events
│   │   │   ├── useTimerStore.js   # Timer state with NTP offset
│   │   │   ├── useNotificationStore.js  # In-app notifications
│   │   │   └── useToastStore.js   # Toast messages
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── lib/                   # Utilities
│   │   │   ├── api.js             # Fetch wrapper with auth
│   │   │   ├── pushNotifications.js # Web Push API integration
│   │   │   └── ...                # Other utilities
│   │   ├── index.css              # Global styles (Tailwind)
│   │   └── main.jsx               # React entry point
│   ├── public/                    # Static assets
│   │   ├── manifest.json          # PWA manifest
│   │   ├── service-worker.js      # Service Worker for offline/caching
│   │   ├── icons/                 # App icons for PWA
│   │   └── ...                    # Other static files
│   ├── index.html                 # HTML entry point
│   ├── vite.config.js             # Vite config + API proxy
│   └── package.json               # Frontend dependencies
├── Dockerfile                      # Multi-stage Docker build
├── docker-compose.yml             # Docker Compose (app + MongoDB)
├── package.json                   # Backend dependencies + scripts
├── CLAUDE.md                      # Guidelines for Claude Code
├── LICENSE                        # MIT License
└── README.md                      # Public-facing overview

```

## Architecture Notes

### Server-Authoritative Timer

The timer state is authoritative on the backend (stored in `User.timerRunning` and `User.timerStartedAt`). When a user starts the timer:

1. **Client** sends `TIMER_START` event via WebSocket
2. **Server** atomically updates the User document with `findOneAndUpdate` and condition check
3. **Server** broadcasts `TIMER_SYNC` to all client devices for that user
4. **Client** displays the elapsed time using NTP offset correction for accuracy

When the user stops the timer:

1. **Client** sends `TIMER_STOP` event
2. **Server** calculates elapsed duration and saves a TrackingData session record
3. **Server** recalculates all stats via `recalcUserStats()` — the single source of truth
4. **Server** checks if goal was reached, increments streak if applicable
5. **Server** triggers webhooks (`timer.stopped`, `goal.reached`, `streak.incremented`)
6. **Server** broadcasts `TIMER_SYNC`, `STATS_UPDATE`, and streak updates via WebSocket
7. **Leaderboard viewers** receive `LEADERBOARD_UPDATE` to refresh rankings

### WebSocket Event Flow

**Rooms:**
- `user:${userId}` — personal device sync (cross-device sync within a user)
- `friends:${friendId}` — friend presence and notifications
- `admins` — admin broadcasts
- `authenticated` — all authenticated users (counter state, leaderboard updates)

**Key events:**
- `COUNTER_START/STOP` — global standing counter (broadcast to all authenticated users)
- `TIMER_SYNC` — personal timer state (to `user:${userId}`)
- `STATS_UPDATE` — user stats refresh (to `user:${userId}`)
- `FRIEND_ONLINE/OFFLINE` — presence notifications (to `friends:${userId}`)
- `NOTIFICATION` — in-app notifications (to `user:${userId}`)
- `LEADERBOARD_UPDATE` — ranking changed (to `authenticated`)

### Streak Evaluation Triggers

**Personal Streaks:**
- Evaluated after every `TIMER_STOP` via `checkAndSetGoalMet(userId, date, io)`
- Full backward walk from today counting consecutive goal-met days
- Off-days skip the count without breaking the streak
- **Midnight rollover** resets streaks that missed the previous day's goal (if streak ≥ 1)
- Webhook `streak.incremented` fires when streak > previous; `streak.broken` fires at midnight if goal missed

**Friend Streaks:**
- Increment when both friends meet their goal on the same calendar day
- Break when either friend misses (evaluated at midnight)
- Webhook fires per-user webhook subscription, not per friend pair

**Group Streaks:**
- Increment when ALL members meet their goals on the same day
- Break when ANY member misses
- Separate from personal streaks, evaluated at midnight

### Scheduled Jobs

**Midnight Rollover** (runs daily at 00:00 server time via `scheduleMidnightJob`):
- Evaluates all personal streaks with `currentStreak > 0`
- Evaluates all friend streaks with `lastSyncDate !== yesterday`
- Evaluates all group streaks
- Sends notifications and webhooks for streak changes
- Idempotent: safe to run multiple times per day

**Session Cleanup** (runs hourly):
- Deletes expired Session documents where `expiresAt < now()`
- MongoDB TTL index also handles cleanup automatically

**Notification Scheduler** (runs hourly):
- Processes pending notifications and sends Web Push

**Streak Integrity Check** (runs at startup):
- Backfills `goalMet` flag for records missing it
- Recalculates all user stats to fix inconsistencies
- Corrects personal, friend, and group streaks

### Service Worker Responsibilities

The frontend Service Worker (`public/service-worker.js`):
- **Offline support:** Caches the app shell (HTML, JS, CSS) for offline access
- **API caching:** Caches read-only API responses (heatmap, leaderboard)
- **Push notifications:** Handles incoming Web Push messages
- **Background sync:** Queues timer events when offline, syncs when reconnected

## Admin Configuration Reference

All settings are managed in the Admin Console at `/admin → Settings` and stored in the `Settings` collection with a 15-second in-memory cache.

### Core Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `appUrl` | string | Auto-detected | Public URL for CORS and callback links |
| `serverPort` | number | 3000 | Port the backend listens on |
| `maintenanceMode` | boolean | false | Blocks all non-super_admin traffic (503) |
| `firstDayOfWeek` | string | 'sunday' | Week start (sunday or monday) affects heatmap/leaderboard/scheduler |

### Authentication

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `jwtSecret` | string | Auto-generated | Secret for signing JWTs; auto-generated on first launch |
| `jwtExpiresIn` | string | '7d' | JWT token lifetime |
| `emailVerificationRequired` | boolean | true | Require email verification before tracking |
| `friendRequestsEnabled` | boolean | true | Allow friend requests |

### SMTP (Email)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `smtpHost` | string | '' | SMTP server hostname |
| `smtpPort` | number | 587 | SMTP port |
| `smtpSecure` | boolean | false | Use TLS |
| `smtpUser` | string | '' | SMTP username |
| `smtpPass` | string | '' | SMTP password (hashed in DB) |
| `smtpFrom` | string | 'noreply@standuptracker.com' | Sender email address |

### Gamification

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultDailyGoalMinutes` | number | 60 | Default daily standing goal |
| `minDailyGoalMinutes` | number | 1 | Minimum goal users can set |
| `maxDailyGoalMinutes` | number | 1440 | Maximum goal users can set |
| `streakMilestones` | array | [3,7,14,30,50,100,200,365] | Streak counts that trigger notifications |

### AI Advice

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ollama_enabled` | boolean | false | Enable Ollama AI advisor |
| `ollama_endpoint` | string | 'http://localhost:11434' | Ollama API endpoint |
| `ollama_model` | string | 'llama2' | Model name to use |
| `ollama_systemPrompt` | string | '...' | Custom system prompt for advice |
| `ollama_maxTokens` | number | 500 | Max tokens per response |
| `aiAdviceCooldownMinutes` | number | 60 | Minimum time between generation requests |
| `aiAdviceCacheDurationMinutes` | number | 1440 | Cache advice for this long (per user) |

### Limits & Rate Limiting

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `maxApiKeysPerUser` | number | 10 | Max API keys per user |
| `maxWebhooksPerUser` | number | 5 | Max webhooks per user |
| `webhookTimeoutSeconds` | number | 5 | HTTP timeout for webhook delivery |

## Troubleshooting

### "MongoDB connection failed"

**Symptom:** Backend logs `MongoDB connection failed` and exits.

**Fix:**
- Ensure MongoDB is running: `docker ps | grep mongo` or `mongosh localhost:27017`
- Check `MONGO_URI` is correct in `.env` or Docker environment
- Verify MongoDB is accessible from the container/network (check firewall)

### "CORS policy does not allow origin"

**Symptom:** Frontend requests fail with CORS errors.

**Fix:**
- Go to Admin Console → Settings
- Set `appUrl` to the frontend URL (e.g., `http://localhost:5173` for dev)
- The server dynamically configures CORS origins from this setting

### "Session expired on page reload"

**Symptom:** User is logged in, but refreshing the page logs them out.

**Fix:**
- Check that `sut_session` HttpOnly cookie is being set (inspect Network tab in DevTools)
- Verify `JWT_SECRET` is consistent across backend restarts
- Ensure MongoDB Session records are not being deleted (check TTL index)

### Timer doesn't sync across devices

**Symptom:** Starting timer on one device doesn't update other devices.

**Fix:**
- Check that both devices are connected to the same WebSocket server
- Verify no proxy/firewall is blocking WebSocket connections
- Check browser console for WebSocket errors
- Restart the backend to clear any stale socket references

### Emails not sending

**Symptom:** Email verification, 2FA, and password reset don't arrive.

**Fix:**
- Go to Admin Console → Settings
- Verify SMTP credentials are correct (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`)
- Test with a free SMTP provider (e.g., Mailtrap, SendGrid)
- Check server logs for SMTP errors: `npm run dev` and look for "SMTP" lines

### AI Advisor returns "Service temporarily unavailable"

**Symptom:** Clicking "Get Advice" shows 503 or timeout error.

**Fix:**
- Ensure Ollama is running: `curl http://localhost:11434/api/tags`
- Go to Admin Console → Settings
- Set `ollama_enabled` to true
- Verify `ollama_endpoint` and `ollama_model` match your Ollama setup
- Ensure Ollama has the model downloaded: `ollama pull llama2`

## Contributing

### Fork & Branch

```bash
git clone https://github.com/YOUR_USERNAME/standuptracker.git
cd standuptracker
git checkout -b feature/your-feature-name
```

### Commit & Push

```bash
git add .
git commit -m "Brief description of changes"
git push origin feature/your-feature-name
```

### Create a Pull Request

Go to the GitHub repository and create a PR against `main`. Include:
- A clear title and description of changes
- Any breaking changes or migration steps
- Screenshots if UI changes

### Code Guidelines

- **Backend:** Use `node --check` to validate syntax
- **Frontend:** Run `npm run build` and `npm run lint` to catch errors
- **Formatting:** Use Prettier/ESLint (configured in `package.json`)
- **Models:** Use Mongoose schema validation
- **API Responses:** Return `{ error: "msg" }` for errors, objects for success
- **Middleware:** Keep chain order consistent (`authenticate` → `softBanCheck` → `lastActiveTouch`)

### Testing

No automated test framework is configured. Testing is manual:
- Start dev servers and test UI flows
- Check server logs for errors
- Verify data consistency in MongoDB
- Test on multiple browsers

### Before Merging

1. Ensure `npm run build` succeeds in frontend
2. Ensure `node --check` passes on modified server files
3. Ensure MongoDB migrations (if any) are documented
4. Ensure no secrets are committed (check for API keys, passwords, etc.)

