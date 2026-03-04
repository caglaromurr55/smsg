const CACHE_NAME = 'secret-messages-v1';

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/manifest.json',
                '/window.svg'
            ]);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Only intercept requests for our own origin
    if (e.request.url.startsWith(self.location.origin)) {
        e.respondWith(
            caches.match(e.request).then((response) => {
                // Return cached response or fetch from network
                return response || fetch(e.request).catch(() => {
                    // Ignore offline fallback for simplicty since it's an online chat app
                });
            })
        );
    }
});
