const CACHE_VERSION = 'weather-app-v5';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const APP_SHELL = [
    './',
    './offline.html',
    './manifest.webmanifest',
    './styles.css',
    './script.js',
    './auth.js',
    './user-data.js',
    './pwa.js',
    './lazy-loader.js'
];

const PUBLIC_API_PREFIXES = [
    '/api/weather',
    '/api/hourly-forecast',
    '/api/daily-forecast',
    '/api/maps-search',
    '/api/radar-frames',
    '/api/weather-tile'
];

const PRIVATE_API_PREFIXES = [
    '/api/favorites',
    '/api/search-history',
    '/api/weather-history',
    '/api/settings',
    '/api/users/',
    '/api/auth/'
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

function isPublicApiRequest(url) {
    return PUBLIC_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isPrivateApiRequest(url) {
    return PRIVATE_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
    return /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|webmanifest|html)$/i.test(url.pathname);
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
                return cachedHome || caches.match('./') || caches.match('./offline.html');
            })
        );
        return;
    }

    if (isPrivateApiRequest(url)) {
        event.respondWith(fetch(request));
        return;
    }

    if (isPublicApiRequest(url)) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    if (isStaticAsset(url) || url.pathname.endsWith('/manifest.webmanifest') || url.pathname.endsWith('/sw.js')) {
        event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
        return;
    }

    event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
