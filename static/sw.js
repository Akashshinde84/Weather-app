const CACHE_VERSION = 'weather-app-v7';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const APP_SHELL = [
    '/',
    '/offline.html',
    '/manifest.webmanifest',
    '/static/css/styles.css',
    '/static/js/script.js',
    '/static/js/auth.js',
    '/static/js/user-data.js',
    '/static/js/pwa.js',
    '/static/js/lazy-loader.js',
    '/static/icons/icon-192.svg',
    '/static/icons/icon-512.svg',
    '/static/icons/icon-maskable.svg'
];

const API_PREFIXES = [
    '/api/weather',
    '/api/hourly-forecast',
    '/api/daily-forecast',
    '/api/favorites',
    '/api/search-history',
    '/api/weather-history',
    '/api/settings',
    '/api/auth/me',
    '/api/users/me',
    '/api/radar-frames'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

function isApiRequest(url) {
    return API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
    return url.pathname.startsWith('/static/');
}

function isNavigationRequest(request) {
    return request.mode === 'navigate';
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkPromise = fetch(request)
        .then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        networkPromise.catch(() => {});
        return cached;
    }

    const response = await networkPromise;
    if (response) return response;
    throw new Error('Offline and no cached response available.');
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    if (isNavigationRequest(request)) {
        event.respondWith(
            networkFirst(request, APP_SHELL_CACHE).catch(async () => {
                const cachedHome = await caches.match('/');
                return cachedHome || caches.match('/offline.html');
            })
        );
        return;
    }

    if (isApiRequest(url)) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    if (isStaticAsset(url) || url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js') {
        event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
        return;
    }

    event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
