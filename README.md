# StandUpTracker

**A full-stack standing-desk time tracker with gamification, real-time sync, social features, and a full admin dashboard.**

StandUpTracker helps you build healthy standing habits by tracking your daily standing sessions, maintaining streaks, competing with friends, and receiving AI-powered productivity coaching. Features include a real-time dashboard with 52-week activity heatmap, leaderboards, groups, and a comprehensive admin console for server management. The app is installable as a PWA and works offline via service workers. All features are secured with JWT + 2FA, and can be controlled programmatically via API keys or automated via webhooks.

## Tech Stack

| Layer | Tech |
|-------|------|
| **Backend** | Node.js 20, Express 4, Socket.io 4, MongoDB 7 |
| **Frontend** | React 19, Vite 7, Zustand 5, Tailwind CSS 4 |
| **Auth** | JWT (HttpOnly cookies), Argon2, TOTP (otplib), Nodemailer |
| **Optional** | Ollama (for AI advisor), Docker & Compose |
| **Features** | WebSockets, Service Worker, Web Push, HMAC-SHA256 signing |

## Quick Start (Docker Compose)

### Prerequisites
- Docker and Docker Compose

### Run

```bash
docker compose up -d
```

The application will be available at **http://localhost:3000**.

**Full `docker-compose.yml`:**
```yaml
services:
  app:
    image: ghcr.io/the12forest/standuptracker:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      MONGO_URI: mongodb://mongo:27017/standuptracker
    depends_on:
      mongo:
        condition: service_healthy

  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

volumes:
  mongo-data:
```

## First Launch & Onboarding

On first launch, the app detects that no users exist and redirects to `/setup`:

1. **Configure SMTP** — Enter your mail server details for email verification and 2FA
2. **Set App URL** — Enter the public URL where the app is accessible
3. **Create Admin Account** — Register the initial **super_admin** account (this first user becomes super_admin automatically)

After setup completes:
- Navigate to `/admin` to access the admin dashboard
- From **Settings**, configure global options (JWT secret is auto-generated)
- New users who register are assigned the `user` role by default
- Promote users to `admin` or `moderator` as needed

## Documentation

- **[`docs/TECHNICAL.md`](docs/TECHNICAL.md)** — Local development, architecture, deployment, troubleshooting, and contributing guide
- **[`docs/API.md`](docs/API.md)** — REST API reference, webhook documentation, and signature verification examples
- **[`LICENSE`](LICENSE)** — MIT License

## Features

**Core Tracking**
- ⏱️ Timer with start/stop, daily totals, session history
- 📊 Activity heatmap (52 weeks), bar charts, daily stats
- 🎯 Configurable daily goals, per-day goal overrides
- 🔥 Personal streaks (current & best), streak milestones

**Gamification**
- 🎮 10-level progression system
- 🏆 Leaderboard with period filtering (week/month/all-time)
- 🤝 Friend requests and shared friend streaks
- 👥 Groups with collective streaks

**Social & Community**
- 👫 Friend lists with online status
- 📬 Friend requests and acceptance workflow
- 👥 Group management and shared goals
- 🔗 Shared heatmap views with friends

**Real-time & Cross-Device**
- 🔄 Socket.io WebSocket for instant device sync
- 📱 PWA installation, offline support via Service Worker
- 🔔 Web Push notifications
- ⏱️ NTP-based clock synchronization

**Authentication & Security**
- 🔐 JWT + HttpOnly cookies, email verification
- 🔑 TOTP 2FA, email 2FA
- 🎭 Admin impersonation with audit logging
- 🚫 Soft-ban system for account suspension

**Admin & Configuration**
- 📈 Server health dashboard with metrics
- 👥 User management (roles, suspension, deletion)
- ⚙️ Global settings (SMTP, JWT secret, feature toggles, AI config)
- 📋 Audit logs (365-day TTL)
- 🔄 Streak integrity checks

**Developer Features**
- 🔑 API Key management (programmatic timer access)
- 🪝 Webhooks (6 event types, up to 5 per user, HMAC-SHA256 signed)
- 🛠️ Public API at `/api/v1` (rate-limited 60 req/min per key)
- 🤖 Optional Ollama-powered AI productivity advisor (per-user opt-in)

## License

MIT
