# Dockerfile

## File Overview

**File path:** `Dockerfile`

This file defines a two-stage Docker build for StandUpTracker. Stage 1 uses a Node 20 Alpine image to compile the React/Vite frontend into static assets. Stage 2 creates the final production image containing the Express backend, the compiled frontend distribution, and the legacy public assets. The resulting container listens on port 3000.

**Dependencies:**
- `node:20-alpine` (Docker base image, used in both stages)
- `frontend/package.json`, `frontend/package-lock.json` (consumed in Stage 1)
- `package.json`, `package-lock.json` (consumed in Stage 2)
- `frontend/` source directory (Stage 1 build input)
- `server/` directory (Stage 2 runtime)
- `public/` directory (Stage 2 legacy assets)

**Side effects when executed:**
- Produces a Docker image with the Express server as the entrypoint.
- Only production backend dependencies are installed in the final image (`--omit=dev`).

---

## Variables & Constants

There are no shell-level variables or ARG/ENV instructions defined in this file.

---

## Build Stages

### Stage 1: `frontend-build`

| Instruction | Details |
|---|---|
| Base image | `node:20-alpine` |
| Working directory | `/build/frontend` |
| Files copied | `frontend/package.json`, `frontend/package-lock.json` |
| Install command | `npm ci --ignore-scripts` with fallback to `npm install` |
| Source copied | Full `frontend/` directory |
| Build command | `npm run build` (Vite production build) |
| Output | `/build/frontend/dist` |

### Stage 2: Production image

| Instruction | Details |
|---|---|
| Base image | `node:20-alpine` |
| Working directory | `/app` |
| Files copied | Root `package.json`, `package-lock.json` |
| Install command | `npm ci --omit=dev` with fallback to `npm install --omit=dev` |
| Directories copied | `server/`, `public/`, and `/build/frontend/dist` → `./frontend/dist` |
| Exposed port | `3000` |
| Entrypoint | `node server/index.js` |

---

## Known Issues & Technical Debt

- The fallback `npm install` in both stages means a missing lock-file does not fail the build. In a strict CI environment it would be preferable to use `npm ci` exclusively so that missing lock-files are a hard error.
- No non-root USER instruction is present; the container runs as root. This is a minor security concern for hardened production deployments.
- No health-check instruction is defined in the Dockerfile (the docker-compose file handles that separately for the MongoDB service only; the `app` service has no HEALTHCHECK).
