# frontend/vite.config.js

## File Overview

**File path:** `frontend/vite.config.js`

Vite build and development server configuration. Registers the React and Tailwind CSS v4 plugins and sets up a development proxy so that API calls and WebSocket connections made from the Vite dev server (port 5173) are forwarded to the Express backend (port 3000) without CORS issues.

**Dependencies (external):**
- `vite` (`defineConfig`)
- `@vitejs/plugin-react`
- `@tailwindcss/vite`

**Side effects when loaded:** None (evaluated by Vite at startup).

---

## Configuration

### Plugins

| Plugin | Purpose |
|---|---|
| `react()` | Enables JSX transform and React Fast Refresh (HMR for React components). |
| `tailwindcss()` | Integrates Tailwind CSS v4 processing into the Vite build pipeline, replacing a separate PostCSS step. |

### Development Server

| Setting | Value | Description |
|---|---|---|
| `server.port` | `5173` | Default Vite dev server port. |
| `server.proxy['/api']` | `'http://localhost:3000'` | Forwards all `/api/*` requests to the Express backend. Prevents CORS errors during development. |
| `server.proxy['/socket.io']` | `{ target: 'http://localhost:3000', ws: true }` | Forwards Socket.io connections (including the WebSocket upgrade) to the backend. `ws: true` enables WebSocket proxying. |

---

## Known Issues & Technical Debt

- No `build.outDir` is explicitly set; Vite defaults to `dist/`. The Dockerfile copies `frontend/dist` to the Express static directory, so this implicit default is load-bearing.
- No `resolve.alias` is configured; all imports use relative paths, which can become unwieldy in deeply nested components.
