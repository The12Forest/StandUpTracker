const CACHE = 'sut-v4';

self.addEventListener('install', (e) => {
  // Skip caching SPA routes — they need the server to serve index.html
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push notification handler — this is what triggers OS-level notifications
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    // Try plain text fallback
    const text = e.data.text();
    data = { title: 'StandUpTracker', body: text };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || 'sut-' + Date.now(),
    renotify: true,
    data: { url: data.url || '/dashboard' },
    // Ensure the notification is visible and persistent
    requireInteraction: false,
    silent: false,
  };

  // waitUntil is critical — without it the SW may be killed before showNotification resolves
  e.waitUntil(
    self.registration.showNotification(data.title || 'StandUpTracker', options)
  );
});

// Click handler — focus or open the app
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

// Push subscription change — re-subscribe if the browser rotates keys
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options).then((subscription) => {
      return fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    }).catch(() => {
      // Best effort — if this fails the user will need to re-enable push in settings
    })
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Skip API and socket requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
