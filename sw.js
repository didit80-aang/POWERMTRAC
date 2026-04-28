// ============================================
// Power Monitoring System - Service Worker
// Version: 1.0.0
// ============================================

const CACHE_NAME = 'power-monitor-v1.0.0';
const DYNAMIC_CACHE = 'power-monitor-dynamic-v1.0.0';
const OFFLINE_PAGE = '/index.html';

// Resources yang akan di-cache saat install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ============ INSTALL EVENT ============
self.addEventListener('install', event => {
    console.log('[SW] 🚀 Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] 📦 Caching static assets...');
                
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[SW] ⚠️ Failed to cache: ${url}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] ✅ Static assets cached successfully');
                return self.skipWaiting();
            })
    );
});

// ============ ACTIVATE EVENT ============
self.addEventListener('activate', event => {
    console.log('[SW] 🔄 Activating Service Worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cache => {
                        if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE) {
                            console.log('[SW] 🗑️ Deleting old cache:', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] ✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// ============ FETCH EVENT ============
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // MQTT WebSocket - biarkan browser handle
    if (url.hostname === 'broker.hivemq.com' || 
        request.url.includes('wss://')) {
        return;
    }
    
    // GET requests only
    if (request.method === 'GET') {
        
        // CDN assets - Cache First
        if (url.hostname.includes('cdnjs.cloudflare.com') || 
            url.hostname.includes('cdn.jsdelivr.net')) {
            
            event.respondWith(
                caches.match(request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            console.log('[SW] 📦 Cache hit:', url.pathname);
                            return cachedResponse;
                        }
                        
                        return fetch(request)
                            .then(networkResponse => {
                                return caches.open(DYNAMIC_CACHE)
                                    .then(cache => {
                                        cache.put(request, networkResponse.clone());
                                        console.log('[SW] 💾 Cached:', url.pathname);
                                        return networkResponse;
                                    });
                            })
                            .catch(() => {
                                return new Response('Resource unavailable offline', {
                                    status: 408,
                                    statusText: 'Offline'
                                });
                            });
                    })
            );
            return;
        }
        
        // Local assets - Network First, fallback ke Cache
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE)
                            .then(cache => {
                                cache.put(request, responseClone);
                                console.log('[SW] 🔄 Updated cache:', url.pathname);
                            });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    console.log('[SW] 📡 Offline mode:', url.pathname);
                    return caches.match(request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            
                            // HTML fallback
                            if (request.headers.get('accept').includes('text/html')) {
                                return caches.match(OFFLINE_PAGE);
                            }
                            
                            return new Response('Offline - Resource not cached', {
                                status: 503,
                                statusText: 'Service Unavailable'
                            });
                        });
                })
        );
    }
});

// ============ MESSAGE EVENT ============
self.addEventListener('message', event => {
    console.log('[SW] 📨 Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cache => caches.delete(cache))
                );
            }).then(() => {
                console.log('[SW] 🗑️ All caches cleared');
            })
        );
    }
});

// ============ PUSH NOTIFICATION ============
self.addEventListener('push', event => {
    console.log('[SW] 🔔 Push received');
    
    let notificationData = {};
    
    try {
        notificationData = event.data.json();
    } catch (e) {
        notificationData = {
            title: 'Power Monitor',
            body: event.data.text(),
            icon: '/icon-192.png'
        };
    }
    
    const options = {
        body: notificationData.body || 'Power monitoring alert',
        icon: notificationData.icon || '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: notificationData.url || '/',
            timestamp: Date.now()
        },
        actions: [
            { action: 'open', title: 'Open Dashboard' },
            { action: 'close', title: 'Dismiss' }
        ],
        tag: notificationData.tag || 'power-alert',
        renotify: true,
        requireInteraction: notificationData.requireInteraction || false
    };
    
    event.waitUntil(
        self.registration.showNotification(
            notificationData.title || 'Power Monitor Alert',
            options
        )
    );
});

// ============ NOTIFICATION CLICK ============
self.addEventListener('notificationclick', event => {
    console.log('[SW] 👆 Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'close') return;
    
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (let client of clientList) {
                    if (client.url.includes(urlToOpen) && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

console.log('[SW] ⚡ Power Monitor Service Worker v1.0.0 Ready!');