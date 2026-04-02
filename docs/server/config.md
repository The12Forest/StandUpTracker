# server/config.js

## File Overview

**File path:** `server/config.js`

This file is the sole bridge between environment variables and the Node.js application. Its only responsibility is loading `dotenv` and exporting the MongoDB connection URI. All other application configuration (SMTP, JWT secrets, feature flags, etc.) is stored in the database `Settings` collection and accessed via `server/utils/settings.js`.

**Dependencies:**
- `dotenv` — reads `.env` file into `process.env`

**Side effects when loaded:**
- Calls `require('dotenv').config()`, which reads the `.env` file in the current working directory (if it exists) and merges its contents into `process.env`.

---

## Variables & Constants

| Name | Type | Value | Description |
|---|---|---|---|
| `mongoUri` (exported) | `string` | `process.env.MONGO_URI` or `'mongodb://localhost:27017/standuptracker'` | MongoDB connection string. Falls back to a local default when the environment variable is not set. |

---

## Exports

```js
module.exports = {
  mongoUri: string,
};
```

Used exclusively by `server/index.js` during the startup database connection.

---

## Known Issues & Technical Debt

None. This file is minimal and fulfills a single clear purpose.
