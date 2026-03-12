// Smart Migration: scavenge legacy localStorage/cookie data
// NOTE: sut_token and sut_user are active session keys — never treat them as legacy
const LEGACY_KEYS = [
  'sut_tracking',
  'standuptracker_features',
  'standupData',
  'timerData',
];

export function scavengeLegacyData() {
  const result = {};
  let hasData = false;

  // 1. localStorage scan
  for (const key of LEGACY_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val) {
        result[key] = JSON.parse(val);
        hasData = true;
      }
    } catch {
      const val = localStorage.getItem(key);
      if (val) {
        result[key] = val;
        hasData = true;
      }
    }
  }

  // 2. Scan for any keys with standup/tracker patterns (exclude active session keys)
  const ACTIVE_KEYS = new Set(['sut_token', 'sut_user', 'sut_originalToken', 'sut_isImpersonating']);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (/standup|tracker|sut_/i.test(key) && !result[key] && !ACTIVE_KEYS.has(key)) {
      try {
        result[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        result[key] = localStorage.getItem(key);
      }
      hasData = true;
    }
  }

  // 3. Cookie scan
  const cookies = document.cookie.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k && /standup|tracker|sut/i.test(k)) {
      acc[k] = decodeURIComponent(v || '');
      hasData = true;
    }
    return acc;
  }, {});

  if (Object.keys(cookies).length > 0) {
    result._cookies = cookies;
  }

  return hasData ? result : null;
}

export function clearLegacyData() {
  for (const key of LEGACY_KEYS) {
    localStorage.removeItem(key);
  }
}
