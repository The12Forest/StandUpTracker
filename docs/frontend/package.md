# frontend/package.json

## File Overview

**File path:** `frontend/package.json`

NPM package manifest for the React frontend. Declares the project as an ES module (`"type": "module"`), lists all runtime and development dependencies, and defines the four standard scripts used for development, production builds, linting, and preview.

**Side effects when loaded:** None (JSON, not executable).

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Starts the Vite development server on port 5173 with HMR and API proxy to the backend. |
| `build` | `vite build` | Produces an optimised production bundle in `frontend/dist/`. Used as the validation step for frontend changes. |
| `lint` | `eslint .` | Runs ESLint over all `.js` and `.jsx` files in the frontend directory. |
| `preview` | `vite preview` | Serves the production build locally for testing before deployment. |

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@tailwindcss/vite` | ^4.2.1 | Tailwind CSS v4 Vite plugin; integrates CSS processing into the Vite build pipeline. |
| `chart.js` | ^4.5.1 | Chart rendering library used for bar charts in DashboardPage and AdminPage. |
| `lucide-react` | ^0.577.0 | Icon set used throughout all components and pages. |
| `react` | ^19.2.0 | React 19 — core UI library. |
| `react-chartjs-2` | ^5.3.1 | React wrapper for Chart.js used in DashboardPage and AdminPage. |
| `react-dom` | ^19.2.0 | React DOM renderer. |
| `react-markdown` | ^10.1.0 | Markdown renderer used in DashboardPage for AI advice output. |
| `react-router-dom` | ^7.13.1 | Client-side routing (BrowserRouter, Routes, Route, NavLink, etc.). |
| `socket.io-client` | ^4.8.3 | WebSocket client for real-time sync with the backend Socket.io server. |
| `tailwindcss` | ^4.2.1 | Utility-first CSS framework. |
| `zustand` | ^5.0.11 | Lightweight state management for auth, timer, socket, notifications, and toasts. |

## Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@eslint/js` | ^9.39.1 | ESLint core JS rules. |
| `@types/react` | ^19.2.7 | TypeScript type definitions for React (used by editor tooling). |
| `@types/react-dom` | ^19.2.3 | TypeScript type definitions for React DOM. |
| `@vitejs/plugin-react` | ^5.1.1 | Vite plugin that enables JSX transform and React Fast Refresh. |
| `eslint` | ^9.39.1 | Linting tool. |
| `eslint-plugin-react-hooks` | ^7.0.1 | ESLint rules enforcing React hook conventions. |
| `eslint-plugin-react-refresh` | ^0.4.24 | ESLint rules ensuring components are compatible with React Fast Refresh. |
| `globals` | ^16.5.0 | Provides browser global definitions for ESLint. |
| `vite` | ^7.3.1 | Build tool and development server. |

---

## Known Issues & Technical Debt

- `@types/react` and `@types/react-dom` are listed as dev dependencies but the project uses `.jsx` files, not TypeScript. They exist for IDE type inference only.
