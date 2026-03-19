const CACHE_NAME = 'sut-v2';
const STATIC_ASSETS = [
  '/',
  '/app',
  '/login',
  '/register',
  '/leaderboard',
  '/css/style.css',
  '/js/theme.js',
  '/js/app.js',
  '/js/features.js',
  '/js/diagram.js',
  '/favicon.png',
  '/icon512_maskable.png',
  '/icon512_rounded.png',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
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

  // Skip API and socket requests — always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
