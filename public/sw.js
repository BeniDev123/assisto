const CACHE_NAME = 'assisto-v1';
const STATIC_ASSETS = [
    '/assets/app.css',
    '/assets/auth-client.js',
    '/assets/sidebar.js',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(STATIC_ASSETS); }));
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
        })
    );
    self.clients.claim();
});

// Stale-while-revalidate for our own static assets (CSS/JS/icons) - safe
// since they rarely change and never carry fault data. Everything else
// (HTML pages, /api/*) is left to the network untouched - this app's whole
// point is showing current, shared data, so a lookup must never be served
// from a cache.
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.indexOf('/assets/') !== 0) return;

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            var network = fetch(event.request).then(function(resp) {
                caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, resp.clone()); });
                return resp;
            }).catch(function() { return cached; });
            return cached || network;
        })
    );
});
