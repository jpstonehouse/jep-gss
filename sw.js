// =============================================================
// JEP GSS — Service Worker
// Strategy: Cache-first for app shell assets, network-first
// for any future API calls (course data, etc.)
// =============================================================

const CACHE_NAME = 'jep-gss-v3';

// App shell assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './JEP%20GSS%20Logo.png',
];

// ── INSTALL ──────────────────────────────────────────────────
// Cache all app shell assets immediately.
// skipWaiting() activates the SW without waiting for old tabs to close.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
// Remove old caches from previous SW versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────
// Cache-first for app shell.
// Network-first for anything that looks like an API call (/api/).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin, non-chrome-extension requests
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // Network-first strategy for API routes (future use)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first strategy for app shell assets
  event.respondWith(cacheFirst(request));
});

// ── STRATEGIES ───────────────────────────────────────────────

/**
 * Cache-first: serve from cache, fall back to network, update cache.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return a minimal offline fallback
    return new Response('<h1>Offline</h1><p>JEP GSS is not yet cached.</p>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Network-first: try network, fall back to cache.
 * Useful for API responses so we don't serve stale data.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    });
  }
}

// ── BACKGROUND SYNC (stub for future use) ───────────────────
// If round data needs to sync to a server when back online,
// handle the 'sync' event here.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-rounds') {
    // TODO: event.waitUntil(syncRoundsToServer());
  }
});
