# StandUpTracker — Documentation Index

This index covers all documented source files in the StandUpTracker repository. Use the directory tree, summary table, and consolidated candidate lists to navigate the codebase.

---

## Directory Tree

```
docs/
├── INDEX.md                                  ← this file
├── .vscode/
│   └── settings.md
├── Dockerfile.md
├── docker-compose.md
├── package.md
│
├── server/
│   ├── config.md
│   ├── index.md
│   ├── middleware/
│   │   ├── auth.md
│   │   └── guards.md
│   ├── models/
│   │   ├── AiAdviceCache.md
│   │   ├── AuditLog.md
│   │   ├── DailyGoalOverride.md
│   │   ├── FriendStreak.md
│   │   ├── Friendship.md
│   │   ├── Group.md
│   │   ├── Log.md
│   │   ├── Notification.md
│   │   ├── OffDay.md
│   │   ├── PushSubscription.md
│   │   ├── Report.md
│   │   ├── Session.md
│   │   ├── Settings.md
│   │   ├── TrackingData.md
│   │   └── User.md
│   ├── routes/
│   │   ├── admin.md
│   │   ├── ai.md
│   │   ├── api.md
│   │   ├── auth.md
│   │   ├── groups.md
│   │   ├── leaderboard.md
│   │   ├── notifications.md
│   │   ├── onboarding.md
│   │   ├── reports.md
│   │   ├── scheduler.md
│   │   └── social.md
│   ├── socket/
│   │   └── handler.md
│   └── utils/
│       ├── email.md
│       ├── logger.md
│       ├── notifications.md
│       ├── pushSender.md
│       ├── recalcStats.md
│       ├── settings.md
│       ├── streaks.md
│       └── totp.md
│
├── frontend/
│   ├── index.md
│   ├── package.md
│   ├── vite.config.md
│   ├── eslint.config.md
│   ├── public/
│   │   ├── manifest.md
│   │   ├── offline.md
│   │   └── sw.md
│   └── src/
│       ├── main.md
│       ├── App.md
│       ├── index.css.md
│       ├── components/
│       │   ├── AppLayout.md
│       │   ├── BentoCard.md
│       │   ├── ForgottenCheckoutModal.md
│       │   ├── GitHubHeatmap.md
│       │   ├── NotificationBell.md
│       │   ├── Sidebar.md
│       │   └── ToastContainer.md
│       ├── hooks/
│       │   ├── useDynamicFavicon.md
│       │   ├── useForgottenCheckout.md
│       │   └── useNtpSync.md
│       ├── lib/
│       │   ├── api.md
│       │   ├── migration.md
│       │   ├── pushNotifications.md
│       │   └── utils.md
│       ├── pages/
│       │   ├── AdminPage.md
│       │   ├── AdminUserTimePage.md
│       │   ├── DashboardPage.md
│       │   ├── GroupsPage.md
│       │   ├── LeaderboardPage.md
│       │   ├── LoginPage.md
│       │   ├── RegisterPage.md
│       │   ├── SchedulerPage.md
│       │   ├── SettingsPage.md
│       │   ├── SetupPage.md
│       │   ├── SocialPage.md
│       │   ├── StreaksPage.md
│       │   ├── TimerPage.md
│       │   └── TwoFactorSetupPage.md
│       └── stores/
│           ├── useAuthStore.md
│           ├── useNotificationStore.md
│           ├── useSocketStore.md
│           ├── useTimerStore.md
│           └── useToastStore.md
│
└── public/  (legacy vanilla-JS SPA)
    ├── index.md
    ├── login.md
    ├── register.md
    ├── admin.md
    ├── app.md
    ├── leaderboard.md
    ├── manifest.md
    ├── sw.md
    ├── css/
    │   └── style.md
    └── js/
        ├── app.md
        ├── diagram.md
        ├── features.md
        └── theme.md
```

---

## Summary Table

| File Path | Purpose | Candidates for Removal | Candidates for Merge |
|---|---|---|---|
| `.vscode/settings.json` | VS Code workspace settings | — | — |
| `Dockerfile` | Multi-stage Docker build | — | — |
| `docker-compose.yml` | App + MongoDB compose stack | — | — |
| `package.json` (root) | Backend NPM manifest | — | — |
| `server/config.js` | Environment configuration bootstrap | — | — |
| `server/index.js` | Express + Socket.io entry point | — | — |
| `server/middleware/auth.js` | JWT/cookie authentication middleware | — | — |
| `server/middleware/guards.js` | Middleware guards (ban, day, impersonation, maintenance) | — | — |
| `server/models/AiAdviceCache.js` | AI advice cache MongoDB model | — | — |
| `server/models/AuditLog.js` | Audit log model with 365-day TTL | — | — |
| `server/models/DailyGoalOverride.js` | Per-user per-day goal override model | — | — |
| `server/models/FriendStreak.js` | Friend streak pair model | — | — |
| `server/models/Friendship.js` | Friend relationship model | — | — |
| `server/models/Group.js` | Group model with streak fields | — | — |
| `server/models/Log.js` | Structured log model | — | — |
| `server/models/Notification.js` | In-app notification model | — | — |
| `server/models/OffDay.js` | Off-day exclusion model | — | — |
| `server/models/PushSubscription.js` | Web Push subscription model | — | — |
| `server/models/Report.js` | User-submitted leaderboard report model | — | — |
| `server/models/Session.js` | Active session model | — | — |
| `server/models/Settings.js` | Key-value settings model | — | — |
| `server/models/TrackingData.js` | Daily standing data model | — | — |
| `server/models/User.js` | User account model | — | — |
| `server/routes/admin.js` | Admin API routes | — | — |
| `server/routes/ai.js` | AI advice routes | — | — |
| `server/routes/api.js` | Timer, tracking, user self-service routes | — | — |
| `server/routes/auth.js` | Authentication routes | — | — |
| `server/routes/groups.js` | Group management routes | — | — |
| `server/routes/leaderboard.js` | Leaderboard routes | — | — |
| `server/routes/notifications.js` | Notification + push routes | — | — |
| `server/routes/onboarding.js` | First-launch setup routes | — | — |
| `server/routes/reports.js` | Report submission routes | — | — |
| `server/routes/scheduler.js` | Admin scheduler routes | — | — |
| `server/routes/social.js` | Friends and social routes | — | — |
| `server/socket/handler.js` | Socket.io event handler | — | — |
| `server/utils/email.js` | Email sending utility | — | — |
| `server/utils/logger.js` | Structured logger | `Settings` import unused | Merge direct `Settings.get()` calls with `getSetting()` cache |
| `server/utils/notifications.js` | In-app notification helpers | — | — |
| `server/utils/pushSender.js` | Web Push delivery | — | — |
| `server/utils/recalcStats.js` | User stats recalculation | — | Level thresholds duplicated in `frontend/src/lib/utils.js` |
| `server/utils/settings.js` | Settings cache + accessors | `isDayCountedInStats` `_date` param | — |
| `server/utils/streaks.js` | Streak lifecycle management | — | — |
| `server/utils/totp.js` | TOTP / 2FA crypto utilities | — | — |
| `frontend/index.html` | Vite SPA entry HTML | — | — |
| `frontend/package.json` | Frontend NPM manifest | — | — |
| `frontend/vite.config.js` | Vite build + dev proxy config | — | — |
| `frontend/eslint.config.js` | ESLint flat config | — | — |
| `frontend/public/manifest.json` | React SPA PWA manifest | — | Merge with `public/manifest.json` |
| `frontend/public/offline.html` | Offline fallback page | — | — |
| `frontend/public/sw.js` | React SPA service worker | — | `push`/`notificationclick` near-identical to `public/sw.js` |
| `frontend/src/main.jsx` | React bootstrap + SW registration | — | — |
| `frontend/src/App.jsx` | Router + app shell | — | — |
| `frontend/src/index.css` | Global design tokens + component classes | — | — |
| `frontend/src/lib/api.js` | HTTP client wrapper | — | — |
| `frontend/src/lib/migration.js` | Legacy data scavenger | `clearLegacyData` (no callers) | — |
| `frontend/src/lib/pushNotifications.js` | Web Push subscribe/unsubscribe | — | — |
| `frontend/src/lib/utils.js` | Time/date/level utilities | — | Level thresholds duplicated in `server/utils/recalcStats.js` |
| `frontend/src/hooks/useDynamicFavicon.js` | Dynamic favicon/title hook | — | — |
| `frontend/src/hooks/useForgottenCheckout.js` | Forgotten checkout detection hook | — | — |
| `frontend/src/hooks/useNtpSync.js` | NTP clock sync hook | — | — |
| `frontend/src/stores/useAuthStore.js` | Auth + impersonation state | — | — |
| `frontend/src/stores/useNotificationStore.js` | Notification list state | — | — |
| `frontend/src/stores/useSocketStore.js` | Socket.io state + event fan-out | `FRIEND_STREAK_UPDATE`/`GROUP_STREAK_UPDATE` handlers are no-ops | — |
| `frontend/src/stores/useTimerStore.js` | Server-authoritative timer state | — | — |
| `frontend/src/stores/useToastStore.js` | Toast queue state | — | — |
| `frontend/src/components/AppLayout.jsx` | Authenticated page shell + impersonation banner | — | — |
| `frontend/src/components/BentoCard.jsx` | Card layout primitives | — | — |
| `frontend/src/components/ForgottenCheckoutModal.jsx` | Forgotten session resolution modal | `window.confirm` duplicated; local `formatDateTime`/`formatDuration` duplicated | Extract helpers to `utils.js` |
| `frontend/src/components/GitHubHeatmap.jsx` | SVG activity heatmap | — | — |
| `frontend/src/components/NotificationBell.jsx` | Notification bell + dropdown | — | — |
| `frontend/src/components/Sidebar.jsx` | Navigation sidebar | — | — |
| `frontend/src/components/ToastContainer.jsx` | Toast renderer | `toast-out` animation unused | — |
| `frontend/src/pages/AdminPage.jsx` | Admin control panel | Inline helpers (`formatBytes`, `formatUptime`, `formatHours`) | Extract helpers to `utils.js` |
| `frontend/src/pages/AdminUserTimePage.jsx` | Admin per-user time editor | Local `formatMinutesDisplay` duplicated | Extract to `utils.js` |
| `frontend/src/pages/DashboardPage.jsx` | Stats + AI advice dashboard | Local `formatHm` duplicated | Extract to `utils.js` |
| `frontend/src/pages/GroupsPage.jsx` | Group management | Local `formatHm` duplicated; `window.confirm` | Extract to `utils.js` |
| `frontend/src/pages/LeaderboardPage.jsx` | Ranked leaderboard | — | — |
| `frontend/src/pages/LoginPage.jsx` | Login + 2FA flow | — | — |
| `frontend/src/pages/RegisterPage.jsx` | Registration | — | — |
| `frontend/src/pages/SchedulerPage.jsx` | Weekly schedule grid | `CoffeeIcon` duplicate import | — |
| `frontend/src/pages/SettingsPage.jsx` | User settings | — | — |
| `frontend/src/pages/SetupPage.jsx` | First-launch wizard | — | — |
| `frontend/src/pages/SocialPage.jsx` | Friends and streaks social | `window.confirm` duplicated | — |
| `frontend/src/pages/StreaksPage.jsx` | Streak overview | — | — |
| `frontend/src/pages/TimerPage.jsx` | Main timer page | — | — |
| `frontend/src/pages/TwoFactorSetupPage.jsx` | Mandatory 2FA enrollment | — | — |
| `public/index.html` | Legacy marketing/landing page | Yes — superseded by React SPA | — |
| `public/login.html` | Legacy login page | Yes — superseded by React SPA | — |
| `public/register.html` | Legacy registration page | Yes — superseded by React SPA | — |
| `public/admin.html` | Legacy admin panel | Yes — superseded by React SPA | — |
| `public/app.html` | Legacy main app page | Yes — superseded by React SPA | — |
| `public/leaderboard.html` | Legacy leaderboard page | Yes — superseded by React SPA | — |
| `public/manifest.json` | Legacy PWA manifest | Yes — once legacy pages removed | Merge with `frontend/public/manifest.json` |
| `public/sw.js` | Legacy service worker | Yes — once legacy pages removed | — |
| `public/css/style.css` | Legacy design system stylesheet | Yes — once legacy pages removed | — |
| `public/js/app.js` | Legacy main app logic | Yes — superseded by React SPA | — |
| `public/js/diagram.js` | Legacy diagram renderer | Yes — only used by legacy landing page | — |
| `public/js/features.js` | Legacy gamification module | Yes — superseded by server-side logic | — |
| `public/js/theme.js` | Legacy theme engine | Yes — superseded by React SPA | — |

---

## Consolidated CANDIDATE FOR REMOVAL List

### Code / Parameters

| Location | Item | Reason |
|---|---|---|
| `server/utils/settings.js` | `_date` parameter of `isDayCountedInStats()` | Parameter is accepted but never used in the function body |
| `server/utils/logger.js` | Direct `Settings` model import | `Settings` is imported but `getSetting()` from `settings.js` (cached) is not used; the import itself may be redundant depending on logger implementation |
| `frontend/src/lib/migration.js` | `clearLegacyData()` function | Exported but never called anywhere in the codebase |
| `frontend/src/stores/useSocketStore.js` | `FRIEND_STREAK_UPDATE` handler body | Handler is registered but its body is an empty comment — no action is taken |
| `frontend/src/stores/useSocketStore.js` | `GROUP_STREAK_UPDATE` handler body | Same as above |
| `frontend/src/components/ToastContainer.jsx` | `toast-out` CSS animation | Defined in `index.css` but never applied in the component |
| `frontend/src/pages/SchedulerPage.jsx` | `CoffeeIcon` import | Duplicate of `Coffee` icon from the same lucide-react package |

### Legacy Files (entire files — superseded by React SPA)

| File | Superseded By |
|---|---|
| `public/index.html` | React SPA landing / login |
| `public/login.html` | `frontend/src/pages/LoginPage.jsx` |
| `public/register.html` | `frontend/src/pages/RegisterPage.jsx` |
| `public/admin.html` | `frontend/src/pages/AdminPage.jsx` |
| `public/app.html` | `frontend/src/pages/TimerPage.jsx` |
| `public/leaderboard.html` | `frontend/src/pages/LeaderboardPage.jsx` |
| `public/manifest.json` | `frontend/public/manifest.json` |
| `public/sw.js` | `frontend/public/sw.js` |
| `public/css/style.css` | `frontend/src/index.css` |
| `public/js/app.js` | React stores and pages |
| `public/js/diagram.js` | React SPA (if landing page removed) |
| `public/js/features.js` | `server/utils/streaks.js`, `frontend/src/lib/utils.js` |
| `public/js/theme.js` | Tailwind CSS dark mode in React SPA |

---

## Consolidated CANDIDATE FOR MERGE List

### Level Threshold Constants

The level threshold array `[0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000]` (hours) and corresponding level titles are duplicated in three locations. Any change to levelling must be made in all three:

| File | Location | Recommendation |
|---|---|---|
| `server/utils/recalcStats.js` | `levels` array, lines 42–43 | Extract to a shared constant |
| `frontend/src/lib/utils.js` | `levelFromSeconds` thresholds and titles arrays | Same shared constant |
| `public/js/features.js` | Level system inside legacy module | Remove with the legacy file |

**Recommendation:** Move the thresholds and titles into a server-side settings entry or a shared constant file that the backend reads and exposes via an API endpoint for the frontend.

---

### PWA Manifests

| File | Issue |
|---|---|
| `frontend/public/manifest.json` | React SPA manifest (green theme, `StandUpTracker`) |
| `public/manifest.json` | Legacy manifest (teal theme, `StandUP Tracker`, different icons) |

**Recommendation:** Once legacy HTML pages are removed, delete `public/manifest.json`. Until then, verify both are served to the correct clients (legacy vs React SPA).

---

### Service Worker Push/Click Handlers

| File | Issue |
|---|---|
| `frontend/public/sw.js` | `push` and `notificationclick` handlers |
| `public/sw.js` | Near-identical `push` and `notificationclick` handlers |

**Recommendation:** Accept divergence until legacy pages are removed; then delete `public/sw.js`.

---

### Settings Cache vs Direct DB Access

| File | Issue |
|---|---|
| `server/utils/logger.js` | Calls `Settings.get()` directly (no cache), bypassing the 15-second cache in `settings.js` |
| `server/utils/settings.js` | Provides `getSetting()` with a 15-second in-memory cache |

**Recommendation:** Refactor `logger.js` to use `getSetting()` from `settings.js` for `debugMode` and `logLevel` reads.

---

### `formatHm` / Time Formatting Helpers

The `formatHm(secs)` function (formats seconds to `Xh Ym`) is reimplemented in at least three page files:

| File | Local Function |
|---|---|
| `frontend/src/pages/DashboardPage.jsx` | `formatHm(secs)` |
| `frontend/src/pages/GroupsPage.jsx` | `formatHm(secs)` |
| `frontend/src/pages/AdminPage.jsx` | `formatHours(secs)` (equivalent) |
| `frontend/src/pages/AdminUserTimePage.jsx` | `formatMinutesDisplay(seconds)` (equivalent) |
| `frontend/src/components/ForgottenCheckoutModal.jsx` | `formatDuration(ms)` (equivalent) |

**Recommendation:** Add a canonical `formatDuration(seconds)` export to `frontend/src/lib/utils.js` and replace all local copies.

---

## Duplicate Functions List

| Function | Locations | Notes |
|---|---|---|
| Level threshold constants | `server/utils/recalcStats.js`, `frontend/src/lib/utils.js`, `public/js/features.js` | Must be kept in sync manually |
| `formatHm` / `formatHours` / `formatDuration` | `DashboardPage`, `GroupsPage`, `AdminPage`, `AdminUserTimePage`, `ForgottenCheckoutModal` | Five near-identical time formatters |
| `today()` / `todayKey()` | `public/js/app.js`, `frontend/src/lib/utils.js` | Legacy vs React SPA versions |
| `fmt(s)` / `formatTime(s)` | `public/js/app.js`, `frontend/src/lib/utils.js` | Legacy vs React SPA versions |
| `fmtShort(s)` / `formatMinutes(s)` | `public/js/app.js`, `frontend/src/lib/utils.js` | Legacy vs React SPA versions |
| `showToast` | `public/js/app.js`, `frontend/src/stores/useToastStore.js` | Legacy vs React SPA versions |
| Push + notification click SW handler | `public/sw.js`, `frontend/public/sw.js` | Two service workers with identical push handling |
| `window.confirm()` for destructive actions | `GroupsPage`, `SocialPage`, `ForgottenCheckoutModal` | Three pages using the same unstyled native confirm pattern |
| Service worker install/activate/push/notificationclick | `public/sw.js`, `frontend/public/sw.js` | Different caching strategies but same push/click logic |
| Level system definitions | `public/js/features.js`, `server/utils/recalcStats.js`, `frontend/src/lib/utils.js` | Entire level system repeated |

---

## Architectural Notes

### Two Generations of SPA

The repository contains two complete application generations:
1. **Legacy vanilla-JS SPA** — `public/` directory with HTML pages, `public/js/`, `public/css/`, `public/manifest.json`, `public/sw.js`. Uses `localStorage` Bearer token auth.
2. **React SPA** — `frontend/` directory built with Vite, React 19, Zustand, Tailwind CSS v4. Uses HttpOnly cookie auth (more secure).

The React SPA is the active production application (built into `frontend/dist/` and served by Express). The legacy files exist alongside it and may still be served for legacy client sessions or bookmarked URLs. Removing the legacy files is the recommended next step once all users have migrated.

### Stats Recalculation Flow

Stats (`totalStandingSeconds`, `totalDays`, `level`) are always fully recalculated by `server/utils/recalcStats.js` — never incremented. Streaks (`currentStreak`, `bestStreak`) are maintained separately by `server/utils/streaks.js` and read back by `recalcStats` as-is.

### Settings Cache

All configuration lives in the MongoDB `Settings` collection. The `server/utils/settings.js` module maintains a 15-second in-memory cache. Any code that bypasses this cache via direct `Settings.get()` (notably `server/utils/logger.js`) creates inconsistency and unnecessary DB load.

### Push Notification Chain

`sendPushNotification()` in `server/utils/pushSender.js` → reads VAPID keys lazily → checks user push preference → delivers via `web-push` → auto-cleans expired subscriptions → disables push on User if all subscriptions are gone. The chain is triggered by `server/utils/streaks.js` (streak milestones and breaks) and by various route handlers.
