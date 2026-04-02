# docker-compose.yml

## File Overview

**File path:** `docker-compose.yml`

This Compose file defines a two-service stack for running StandUpTracker in production. The `app` service pulls the pre-built container image from GitHub Container Registry and connects to the `mongo` service. The `mongo` service runs MongoDB 7 with a named volume for data persistence. The stack ensures MongoDB is healthy before the application container starts.

**Dependencies:**
- `ghcr.io/the12forest/standuptracker:latest` — the application Docker image
- `mongo:7` — MongoDB 7 official image

**Side effects when executed (`docker compose up -d`):**
- Creates a `mongo-data` named Docker volume if it does not already exist.
- Starts two containers; the `app` container will not start until MongoDB responds to `mongosh --eval "db.adminCommand('ping')"`.

---

## Services

### `app`

| Key | Value | Description |
|---|---|---|
| `image` | `ghcr.io/the12forest/standuptracker:latest` | Pre-built production image from GHCR |
| `restart` | `unless-stopped` | Restarts automatically unless manually stopped |
| `ports` | `3000:3000` | Maps host port 3000 to container port 3000 |
| `environment.MONGO_URI` | `mongodb://mongo:27017/standuptracker` | Instructs the app to connect to the Compose-internal `mongo` service |
| `depends_on.mongo.condition` | `service_healthy` | Delays startup until MongoDB health check passes |

### `mongo`

| Key | Value | Description |
|---|---|---|
| `image` | `mongo:7` | Official MongoDB 7 image |
| `restart` | `unless-stopped` | Restarts automatically unless manually stopped |
| `volumes` | `mongo-data:/data/db` | Persists database files to the named volume |
| Health check test | `mongosh --eval "db.adminCommand('ping')"` | Verifies the MongoDB process is accepting connections |
| Health check interval | `10s` | Runs every 10 seconds |
| Health check timeout | `5s` | Fails if the check does not complete within 5 seconds |
| Health check retries | `5` | Marks the container unhealthy after 5 consecutive failures |
| Health check start period | `20s` | Grace period before failures are counted |

---

## Volumes

| Name | Purpose |
|---|---|
| `mongo-data` | Persists MongoDB data files across container restarts and re-creations |

---

## Known Issues & Technical Debt

- The `app` service has no explicit health check. A failure in the Node.js process will not be detected by Docker until the container exits.
- Using `latest` as the image tag in production means deployments are not pinned to a specific release; a `docker compose pull` could introduce a breaking change unintentionally.
- No resource limits (CPU/memory) are configured.
