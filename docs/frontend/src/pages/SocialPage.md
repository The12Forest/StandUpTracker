# frontend/src/pages/SocialPage.jsx

## File Overview

**File path:** `frontend/src/pages/SocialPage.jsx`

Friends and social interactions page. Three tabs: "Friends" (list with online indicators, streaks, and an expandable heatmap), "Requests" (incoming and outgoing), and "Add Friend" (username search). Real-time presence updates (online/offline) and friend streak changes arrive via Socket.io events.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../components/GitHubHeatmap`
- `../stores/useAuthStore`
- `../stores/useToastStore`
- `../stores/useSocketStore`

**Dependencies (external):**
- `react` (`useState`, `useEffect`, `useCallback`, `useRef`)
- `lucide-react` (`Users`, `UserPlus`, `UserCheck`, `UserX`, `Flame`, `Calendar`, `Clock`, `X`, `Search`, `Trash2`, `Timer`)

**Side effects when mounted:** Fetches friends list and pending requests. Registers socket listeners for presence and friend events.

---

## Socket Events Handled

| Event | Action |
|---|---|
| `FRIEND_ONLINE` | Adds `userId` to `onlineSet`. |
| `FRIEND_OFFLINE` | Removes `userId` from `onlineSet`. |
| `FRIEND_REQUEST` | Refreshes the requests list. |
| `FRIEND_ACCEPTED` | Refreshes both friends and requests. |
| `FRIEND_STREAK_UPDATE` | Refetches friend streaks for the affected pair. |

---

## Key Functions

- `loadFriends()` — fetches `GET /api/social/friends`.
- `loadRequests()` — fetches incoming and outgoing requests in parallel.
- `sendRequest(username)` — POSTs to `POST /api/social/request`.
- `acceptRequest(userId)` / `declineRequest(userId)` — accept or decline incoming requests.
- `cancelRequest(userId)` — cancels an outgoing request.
- `removeFriend(userId)` — removes a friend with `window.confirm` guard.
- `openHeatmap(friend)` — fetches the friend's tracking data and off-days, then opens the heatmap panel.
- `fetchStreakForFriend(friend)` — fetches the friend streak for a pair (deduped via `streaksFetchedRef`).

---

## Exports

| Export | Description |
|---|---|
| `default SocialPage` | Mounted at `/friends` in `App.jsx`. |

---

## Known Issues & Technical Debt

- `streaksFetchedRef` prevents refetching streaks for friends already loaded, but it is never cleared when the friends list changes. Adding/removing a friend will not cause re-fetching of streaks for existing friends.
- Uses `window.confirm()` for friend removal. `[DUPLICATE — same pattern as GroupsPage]`
