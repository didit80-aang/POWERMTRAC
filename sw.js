// Service Worker untuk PWA Power Monitoring System
const CACHE_NAME = 'power-monitor-v1';
const urlsToCache = [
  '.',
  'index.html',
  'manifest.json',
  'icon-72.png',
  'icon-96.png',
  'icon-128.png',
  'icon-144.png',
  'icon-152.png',
  'icon-192.png',
  'icon-384.png',
  'icon-512.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - strategi cache first, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event.notification.tag);
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Cek apakah sudah ada window yang terbuka
        for (let client of windowClients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Jika belum ada, buka window baru
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Push event handler
self.addEventListener('push', event => {
  console.log('Push received:', event);
  let title = 'Power Monitoring System';
  let body = 'New alert from Power Monitor';
  let tag = 'power-alert';
  
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      tag = data.tag || tag;
    } catch (e) {
      body = event.data.text();
    }
  }
  
  const options = {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-96.png',
    tag: tag,
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});