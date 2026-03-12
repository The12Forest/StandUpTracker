# Claude.md

This file provides quick context for working in this repository with AI coding assistants.

## Project
- Name: StandUpTracker
- Stack: Node.js + Express + MongoDB (backend), React + Vite (frontend)
- Main server entry: `server/index.js`
- Frontend app: `frontend/`

## Run Commands
- Install root deps: `npm install`
- Start backend: `npm start`
- Start backend (dev): `npm run dev`
- Frontend dev server: `cd frontend && npm install && npm run dev`
- Frontend build: `cd frontend && npm run build`

## High-Level Structure
- `server/routes/`: API routes (auth, api, admin, groups, social, leaderboard)
- `server/models/`: Mongoose models
- `server/middleware/`: auth/guards and request protections
- `server/socket/`: Socket.io event handlers
- `server/utils/`: helper utilities (email, streak logic, logger, settings)
- `frontend/src/pages/`: route-level React pages
- `frontend/src/stores/`: Zustand state stores
- `frontend/src/lib/api.js`: fetch wrapper + auth handling

## Working Guidelines
- Keep server routes consistent with middleware usage (especially `authenticate`, `requireVerified`, `softBanCheck`).
- Preserve existing response shapes unless a change is intentional and coordinated with frontend usage.
- Favor small, focused patches over broad refactors.
- Validate syntax with `node --check` for server files after edits.
- Validate frontend with `npm run build` in `frontend/` after UI or store changes.

## Notes
- Docker support exists via `Dockerfile` and `docker-compose.yml`.
- If Docker verification is required, ensure Docker Engine/Desktop is running before `docker compose up`.
