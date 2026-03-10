# StandUpTracker

A full-stack standing-desk time tracker with gamification, real-time sync, social features, and a full admin dashboard.

## Features

- **Timer** — Track standing sessions with start/stop, daily totals, personal streak
- **Dashboard** — Activity heatmap (52 weeks), bar chart of last 30 days, AI productivity tips
- **Gamification** — Levels, achievements, daily goals
- **Real-time Sync** — Socket.io WebSocket keeps all devices in sync
- **Authentication** — JWT + HttpOnly cookies, email verification, TOTP and email 2FA
- **Admin Dashboard** — Server health, user management, audit logs, global settings, extended statistics
- **Social** — Friend requests, friend streaks, group streaks
- **Leaderboard** — Public ranked standings with period filtering
- **AI Advisor** — Optional Ollama-powered productivity coaching (per-user opt-in)
- **PWA** — Installable, works offline with service worker caching

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20, Express 4, Socket.io 4 |
| Database | MongoDB 7, Mongoose 8 |
| Auth | JWT (HttpOnly cookies), Argon2, TOTP (otplib), Nodemailer |
| Frontend | React 19, Vite 7, Zustand 5, Tailwind CSS 4, Chart.js 4 |
| Infrastructure | Docker, Docker Compose |

## Quick Start

### Docker (Recommended)

```bash
# Only MONGO_URI is required — all other settings are managed via the Admin Console
export MONGO_URI=mongodb://mongo:27017/standuptracker
docker compose up -d
```

The app will be available at `http://localhost:3000`.

### Local Development

```bash
# Requires Node.js 20+ and a running MongoDB instance
export MONGO_URI=mongodb://localhost:27017/standuptracker

# Start backend
npm install
npm start

# Start frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` and proxies API requests to the backend.

## Environment Variables

Only **one** environment variable is required to run the app:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://mongo:27017/standuptracker` | MongoDB connection string |

All other settings (JWT secret, SMTP, app URL, AI configuration, etc.) are generated automatically or managed through the **Admin Console** at `/admin` and stored in the database. There is no `.env` file to maintain beyond the database connection.

## First Launch

On first launch, the app detects that no users exist and redirects to `/setup` — an onboarding wizard that lets you:

1. Configure SMTP (for email verification and 2FA)
2. Set the public app URL
3. Create the initial **super_admin** account

After completing setup, the admin can manage all settings from the **Admin Console**. Subsequent registered users are assigned the `user` role by default.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/verify-email` | Email verification |
| GET | `/api/auth/me` | Current user profile |
| PUT | `/api/auth/profile` | Update theme/goal |
| PUT | `/api/auth/password` | Change password |
| PUT | `/api/auth/email` | Change email |
| POST | `/api/auth/2fa/totp/setup` | TOTP setup (QR) |
| POST | `/api/auth/2fa/totp/enable` | Enable TOTP |
| POST | `/api/auth/2fa/totp/disable` | Disable TOTP |
| POST | `/api/auth/2fa/email/enable` | Enable email 2FA |
| POST | `/api/auth/2fa/email/disable` | Disable email 2FA |

### Tracking
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tracking` | Save tracking data |
| GET | `/api/tracking` | Get tracking data |
| POST | `/api/tracking/sync` | Bulk import from localStorage |
| GET | `/api/stats` | User stats |

### Admin (admin/super_admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Server health & stats |
| GET | `/api/admin/users` | User list (paginated) |
| PUT | `/api/admin/users/:userId` | Update user role/active |
| DELETE | `/api/admin/users/:userId` | Delete user |
| POST | `/api/admin/users/bulk-action` | Bulk role/active changes |
| POST | `/api/admin/impersonate/:userId` | Impersonate user |
| GET | `/api/admin/logs` | Server logs (paginated) |
| GET | `/api/admin/settings` | Global settings |
| PUT | `/api/admin/settings` | Update settings |

### Social
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/social/friends` | Friend list |
| POST | `/api/social/friends/request` | Send friend request |
| PUT | `/api/social/friends/:id` | Accept/decline request |
| DELETE | `/api/social/friends/:id` | Remove friend |

### Groups
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/groups` | List user's groups |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |
| POST | `/api/groups/:id/members` | Add member |
| DELETE | `/api/groups/:id/members/:userId` | Remove member |

### AI
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/advice` | Get AI productivity tip |
| GET | `/api/ai/models` | List available Ollama models |

### Setup
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/setup/status` | Check if setup is needed |
| POST | `/api/setup/complete` | Complete initial setup |

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leaderboard` | Public leaderboard |
| GET | `/api/health` | Health check |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `COUNTER_START` | Client → Server | Start standing session |
| `COUNTER_STOP` | Client → Server | Stop standing session |
| `STATE_SYNC` | Server → Client | Counter state broadcast |
| `TRACKING_UPDATE` | Client ↔ Server | Sync tracking across devices |
| `FRIEND_ONLINE` | Server → Client | Friend came online |
| `FRIEND_OFFLINE` | Server → Client | Friend went offline |
| `HEARTBEAT` | Client → Server | Keep connection alive |

## Project Structure

```
├── server/
│   ├── index.js          # Express + Socket.io entry point
│   ├── config.js         # DB-backed config with env fallbacks
│   ├── models/           # Mongoose models
│   ├── routes/           # REST API routes
│   ├── middleware/        # Auth guards
│   ├── socket/           # WebSocket event handler
│   └── utils/            # Email, TOTP, streaks, logging
├── frontend/
│   ├── src/
│   │   ├── pages/        # Route-level React components
│   │   ├── components/   # Shared UI components (heatmap, charts…)
│   │   ├── stores/       # Zustand state stores
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # API client, utils, migration
│   ├── public/           # Static assets & PWA manifest
│   └── vite.config.js    # Vite + proxy config
├── Dockerfile
├── docker-compose.yml
└── package.json          # Backend only
```

## License

MIT
