const OFFLINE_CACHE = 'sut-offline-v1';
const OFFLINE_URL = '/offline.html';

// Install — cache only the offline fallback page
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete all old caches, claim clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — only intercept navigation requests; serve offline page on network failure
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(OFFLINE_URL))
  );
});

// Push — display OS-level notification
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: 'StandUpTracker', body: e.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/vite.svg',
    badge: data.badge || '/vite.svg',
    tag: data.tag || 'sut-' + Date.now(),
    renotify: true,
    data: { url: data.url || '/dashboard' },
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'StandUpTracker', options)
  );
});

// Notification click — focus existing window or open new one
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/dashboard';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Re-subscribe if browser rotates push subscription keys
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then((sub) => fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      }))
      .catch(() => {})
  );
});
