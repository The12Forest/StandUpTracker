const CACHE = 'sut-v3';
const STATIC = ['/app', '/login', '/register'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push notification handler
self.addEventListener('push', (e) => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    const options = {
      body: data.body || '',
      icon: data.icon || '/favicon.png',
      badge: '/favicon.png',
      data: { url: data.url || '/dashboard' },
    };
    e.waitUntil(self.registration.showNotification(data.title || 'StandUpTracker', options));
  } catch {
    // Ignore malformed push payloads
  }
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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Skip API and socket requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
