# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy legacy public assets
COPY public/ ./public/

# Copy built frontend from stage 1
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

EXPOSE 3000

CMD ["node", "server/index.js"]
