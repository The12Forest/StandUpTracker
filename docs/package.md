# package.json (root)

## File Overview

**File path:** `package.json`

This is the root npm package manifest for the StandUpTracker backend. It declares the Express server as the main entry point, defines two npm scripts for running the server, and lists all runtime and development dependencies. This file governs the Node.js runtime that powers the REST API, WebSocket layer, and database connection.

**Dependencies (runtime):**
- `argon2` — password hashing
- `cors` — Cross-Origin Resource Sharing middleware
- `dotenv` — loads `MONGO_URI` from `.env` files
- `express` — HTTP server framework
- `express-rate-limit` — rate limiting for auth endpoints
- `helmet` — security HTTP headers
- `jsonwebtoken` — JWT generation (legacy; sessions are now DB-backed, but JWT secret management remains)
- `mongoose` — MongoDB ODM
- `nodemailer` — email delivery (verification, 2FA codes)
- `otplib` — TOTP (Time-based One-Time Password) generation and verification
- `qrcode` — generates QR codes for TOTP enrollment
- `socket.io` — WebSocket server
- `uuid` — generates v4 UUIDs for userId and groupId
- `web-push` — VAPID-based Web Push notifications

**Dependencies (dev):**
- `mongodb-memory-server` — in-process MongoDB for fallback/testing
- `nodemon` — auto-restarts server on file changes during development

**Side effects when installed:** None beyond writing `node_modules/`.

---

## Variables & Constants

| Key | Value | Description |
|---|---|---|
| `name` | `standuptracker` | Package name |
| `version` | `2.0.0` | Current version |
| `main` | `server/index.js` | Entry point for `node .` and Docker CMD |

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `start` | `node server/index.js` | Runs the production server |
| `dev` | `nodemon server/index.js` | Runs with automatic restart on file changes |

---

## Known Issues & Technical Debt

- `jsonwebtoken` is listed as a runtime dependency, but the application has migrated to database-backed sessions. The JWT library is still used only for the `jwtSecret` setting management. It could be removed if the secret were stored purely as a settings key without any JWT signing.
- `mongodb-memory-server` is in `devDependencies` but is required at runtime by `server/index.js` as a fallback when the primary MongoDB is unreachable. It should be in `dependencies` for production Docker builds to be safe.
