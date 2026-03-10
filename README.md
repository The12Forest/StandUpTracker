# StandUP Tracker

A full-stack standing time tracker with gamification, real-time sync, and admin dashboard.

## Features

- **Timer** — Track standing sessions with start/stop, daily totals, streaks
- **Gamification** — Levels, achievements, daily & weekly challenges, celebrations
- **Real-time Sync** — Socket.io WebSocket keeps all devices in sync
- **Authentication** — JWT auth, email verification, TOTP & email 2FA
- **Admin Dashboard** — Server health, user management, logs, global settings
- **Public Leaderboard** — Ranked standings with period filtering
- **PWA** — Installable, works offline with service worker caching
- **Multi-device** — Transparent sync across all logged-in devices

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, Socket.io |
| Database | MongoDB (Mongoose) |
| Auth | JWT, Argon2, TOTP (otplib), Nodemailer |
| Frontend | Vanilla JS, CSS custom properties, Chart.js |
| Infrastructure | Docker, Docker Compose |

## Quick Start

### Docker (Recommended)

```bash
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

The app will be available at `http://localhost:3000`.

### Local Development

```bash
# Requires Node.js 20+ and a running MongoDB instance
cp .env.example .env
# Edit .env — set MONGO_URI to your local MongoDB
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MONGO_URI` | `mongodb://mongo:27017/standuptracker` | MongoDB connection string |
| `JWT_SECRET` | *(required)* | Secret for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `SMTP_HOST` | — | SMTP server for email |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | `noreply@standuptracker.app` | Sender address |
| `APP_URL` | `http://localhost:3000` | Public URL (for email links) |

## First User

The first registered user automatically becomes **super_admin** with full access. Subsequent users are regular users.

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
| GET | `/api/admin/logs` | Server logs (paginated) |
| GET | `/api/admin/settings` | Global settings |
| PUT | `/api/admin/settings` | Update settings |

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leaderboard` | Public leaderboard |
| GET | `/api/health` | Health check |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `COUNTER_START` | Client → Server | Start global counter |
| `COUNTER_STOP` | Client → Server | Stop global counter |
| `STATE_SYNC` | Server → Client | Counter state broadcast |
| `TRACKING_UPDATE` | Client ↔ Server | Sync tracking across devices |
| `HEARTBEAT` | Client → Server | Keep connection alive |

## Project Structure

```
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── config.js         # Environment config
│   ├── models/           # Mongoose models
│   ├── routes/           # REST API routes
│   ├── middleware/        # Auth middleware
│   ├── socket/           # WebSocket handlers
│   └── utils/            # Email, TOTP, logging
├── public/
│   ├── index.html        # Landing page
│   ├── login.html        # Login
│   ├── register.html     # Registration
│   ├── app.html          # Main tracker app
│   ├── admin.html        # Admin dashboard
│   ├── leaderboard.html  # Public leaderboard
│   ├── css/style.css     # Design system
│   ├── js/               # Client modules
│   └── sw.js             # Service worker
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT
