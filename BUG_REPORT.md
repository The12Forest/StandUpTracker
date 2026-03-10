# StandUpTracker — Codebase Bug Report

10-pass audit covering auth, config, UI, tracking, SMTP, streaks, social, groups, admin, and AI.

---

## Fixed Bugs

### BUG-01 — Socket handler: hardcoded config key for JWT secret
**Severity:** Critical  
**File:** `server/socket/handler.js`  
**Status:** ✅ Fixed (prior session)

The socket authentication middleware called `config.jwt.secret` directly instead of the async `getJwtSecret()` DB accessor. After the JWT secret was migrated to DB-backed config, all socket connections would fail to verify tokens, locking every user out of real-time features.

**Fix:** Replaced `config.jwt.secret` with `await getJwtSecret()`.

---

### BUG-02 — SetupPage: infinite redirect loop after setup completion
**Severity:** Critical  
**File:** `frontend/src/pages/SetupPage.jsx` (previously), `frontend/src/App.jsx`  
**Status:** ✅ Fixed (prior session)

After the setup wizard completed, `navigate('/app')` performed a client-side React Router navigation. Because `App.jsx` held `setupComplete === false` in in-memory state and did not re-read it from the server, the app immediately re-redirected back to `/setup`, creating an infinite loop.

**Fix:** Replaced `navigate('/app')` with `window.location.href = '/app'` to force a full page reload, which re-fetches the setup status from the server.

---

### BUG-03 — Streak cleanup: duplicate `$ne` keys silently overwrites query
**Severity:** High  
**File:** `server/utils/streaks.js` — `dailyStreakCleanup()`  
**Status:** ✅ Fixed (this session)

Both the FriendStreak and Group streak cleanup queries contained:
```js
lastSyncDate: { $ne: yesterday, $ne: todayStr() }
```
In JavaScript, duplicate keys in an object literal are silently de-duplicated — the second key overwrites the first. The effective query became `{ $ne: todayStr() }` only, completely ignoring the `yesterday` exclusion.

**Impact:** Streaks whose `lastSyncDate` was *yesterday* (i.e. they were already handled) would still be selected for cleanup. This caused valid active streaks to be incorrectly reset whenever one party hadn't tracked yet *today* (and the cleanup ran mid-day before they'd had a chance to sync).

**Fix:** Changed both occurrences to `{ $nin: [yesterday, todayStr()] }`.

---

### BUG-04 — SMTP hash: password excluded from change-detection
**Severity:** Medium  
**File:** `server/utils/email.js` — `smtpHash()`  
**Status:** ✅ Fixed (this session)

The `smtpHash()` function used to produce:
```js
`${smtp.host}:${smtp.port}:${smtp.user}:${smtp.secure}`
```
The SMTP password (`smtp.pass`) was not included. Changing only the password (without changing host, port, or user) would not trigger transporter recreation, leaving the old (broken) transporter in memory.

Note: `resetTransporter()` is called on every admin settings save, which mitigates this in practice. However, the hash logic was still incorrect and would fail silently in any future code path that bypasses the admin save.

**Fix:** Added `smtp.pass` to the hash string: `` `${smtp.host}:${smtp.port}:${smtp.user}:${smtp.pass}:${smtp.secure}` ``.

---

### BUG-05 — Heatmap tooltip: text appears on hover (UI regression)
**Severity:** Low  
**File:** `frontend/src/components/GitHubHeatmap.jsx`  
**Status:** ✅ Fixed (this session)

The heatmap rendered a `useState`-backed floating tooltip div on every SVG cell hover, showing date and activity text (e.g. "No activity on Thu, 14 Aug 2025"). This was unintended — the design requires a clean heatmap with no interactive overlays.

**Fix:**
- Removed `useState` from React imports.
- Removed `const [tooltip, setTooltip] = useState(null)` state variable.
- Removed the `formatDate()` helper function.
- Removed `onMouseEnter` and `onMouseLeave` handlers from every `<rect>` cell.
- Removed the `style={{ cursor: 'default' }}` attribute.
- Removed the entire tooltip `<div>` JSX block.

---

## Findings Without Code Changes

### NOTE-01 — `geminiOptIn` field name is a residual from Gemini API (now Ollama)
**Severity:** Cosmetic  
**Files:** `server/middleware/guards.js`, `server/models/User.js`, `frontend/src/pages/SettingsPage.jsx`

The AI opt-in feature was originally built against the Google Gemini API and later migrated to self-hosted Ollama. The User model field `geminiOptIn` and the `aiGateCheck` middleware still reference the old name. This does not cause any functional errors — the field exists in the DB schema with `default: false` and is correctly read by `aiGateCheck`. However, it is misleading for anyone reading the code.

**Recommendation:** Rename to `aiOptIn` in a future migration, updating the schema, middleware, and all frontend references.

---

### NOTE-02 — Log collection TTL index is hardcoded to 90 days
**Severity:** Low  
**File:** `server/models/Log.js`

The `Log` model defines a MongoDB TTL index as `expireAfterSeconds: 90 * 24 * 60 * 60` (90 days, hardcoded). The admin settings include a `logRetentionDays` setting, but the Mongoose schema does not read it — the index is set once on collection creation and never updated.

**Impact:** Changing `logRetentionDays` in the Admin Console has no effect on actual log expiry.

**Recommendation:** Either document that only the default TTL applies and remove `logRetentionDays` from settings, or implement a TTL index update command that runs on startup or when the setting changes.

---

### NOTE-03 — Leaderboard `limit` parameter has no maximum cap
**Severity:** Low  
**File:** `server/routes/leaderboard.js`

`GET /api/leaderboard?limit=N` passes `parseInt(limit)` directly to Mongoose without bounding it. An unauthenticated caller can request an arbitrarily large number of rows, causing excessive memory and DB load.

**Recommendation:** Clamp the limit: `Math.min(parseInt(limit) || 50, 200)`.

**Fix applied:** `safeLimit = Math.min(parseInt(limit) || 50, 200)` — capped at 200.

---

### NOTE-04 — Admin user search passes unsanitized regex to MongoDB
**Severity:** Low (admin-only endpoint)  
**File:** `server/routes/admin.js` — `GET /users`

The `search` query parameter is passed directly into a MongoDB `$regex` operator without escaping. A crafted regex with catastrophic backtracking (ReDoS) could block the MongoDB query thread.

Since this endpoint requires `admin` or `super_admin` role, the attack surface is limited to already-trusted users. However:

**Recommendation:** Escape the search string before using it as a regex: 
```js
const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
query.$or = [
  { username: { $regex: escaped, $options: 'i' } },
  { email: { $regex: escaped, $options: 'i' } },
];
```

**Fix applied.**

---

## 10-Pass Summary

| Pass | Area | Bugs Found | Status |
|------|------|-----------|--------|
| 1 | Auth / Sessions | BUG-01 (JWT socket) | ✅ Fixed (prior) |
| 2 | Config / Settings migration | BUG-01 (same root cause) | ✅ Fixed (prior) |
| 3 | Onboarding / Setup | BUG-02 (redirect loop) | ✅ Fixed (prior) |
| 4 | Tracking / Stats | — | ✅ Clean |
| 5 | SMTP / Email | BUG-04 (hash missing pass) | ✅ Fixed |
| 6 | Streaks | BUG-03 (`$ne` key collision) | ✅ Fixed |
| 7 | Social / Friendships | — | ✅ Clean |
| 8 | Groups | — | ✅ Clean |
| 9 | Admin Panel | NOTE-03, NOTE-04 | ✅ Fixed |
| 10 | AI / Ollama | NOTE-01, NOTE-02 | ⚠️ Notes (cosmetic/design) |
