/**
 * PRYZM 3 Service Worker — Wave A20 / Phase F (A20-T17)
 *
 * Strategy:
 *   - App shell (/, /index.html, /manifest.json): cache-first for offline access
 *   - API calls (/api/*, /v1/*): network-first with offline fallback
 *   - Vite-hashed assets (/assets/*): cache-first (immutable, hash-keyed)
 *   - Everything else: network-first, cache on success
 *
 * Contract: C07 §7 — PWA manifest + service worker requirements.
 * Boolean: #8 headless_published (A20-T16-T19 together close G11/G3 PWA gap).
 */

// S5.1-FINAL cache version bump (2026-05-10) — evicts all stale production
// chunks cached under old Replit deployment URLs (e.g. video-prep-5--*.replit.app).
// When `activate` fires, the filter below deletes every cache whose name is
// not in VALID_CACHES, which includes both `pryzm-v1` and `pryzm-assets-v1`
// from prior deployments.  This permanently closes the
// "EdgeProjectorService lazy load failed: Failed to fetch dynamically imported
// module: https://<old-domain>/assets/EdgeProjectorService-DPymAjO5.js" class
// of errors caused by cross-domain cache poisoning after a Replit app rename.
// v3 (2026-06-05) — bumped to EVICT the poisoned v2 app-shell cache that held a
// stale index.html. The v2 fetch handler served `/` + index.html CACHE-FIRST, so
// once cached the OLD shell (pointing at OLD /assets/ chunk hashes) was returned
// forever — every deploy left users on old code until a manual "Clear site data".
// v3 deletes that cache on activate AND switches navigations to network-first
// (below), so a new deploy's shell is always picked up when online.
const CACHE_NAME = 'pryzm-v3';
const ASSETS_CACHE = 'pryzm-assets-v3';
const VALID_CACHES = new Set([CACHE_NAME, ASSETS_CACHE]);

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: pre-cache app shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[sw] App shell pre-cache partial failure:', err);
      })
    )
  );
  self.skipWaiting();
});

// ── Activate: evict stale caches ──────────────────────────────────────────
// Uses VALID_CACHES set so any cache name not matching the current version
// (including pryzm-v1 and pryzm-assets-v1 from old deployments) is deleted.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !VALID_CACHES.has(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch handler ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // WebSocket / non-GET requests: let the browser handle directly
  if (request.method !== 'GET') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // API and v1 calls: network-first (real-time data must be fresh)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'offline', code: 'OFFLINE_MODE', message: 'No network connection' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        )
      )
    );
    return;
  }

  // Vite-hashed assets (/assets/): cache-first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // ── App shell / navigations / HTML: NETWORK-FIRST ──────────────────────────
  // THE FIX for "prod shows old code after a deploy". index.html is the entry
  // that references the current build's hashed /assets/ chunks; if it is served
  // cache-first (the old behaviour) the browser keeps loading the OLD chunk graph
  // forever and a fresh deploy never reaches the user without a manual cache
  // clear. Network-first means: when online, always fetch the latest shell (and
  // refresh the cache); only fall back to the cached shell when truly offline.
  // /assets/* stay cache-first above (immutable + hash-keyed → always correct,
  // because the freshly-fetched index.html names the new hashes).
  const isAppShell =
    request.mode === 'navigate' || APP_SHELL.includes(url.pathname);
  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Offline: serve the cached shell so the SPA still boots.
          const cached =
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            (await caches.match('/index.html'));
          return cached || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Everything else (misc same-origin GETs, e.g. /items/, /favicon): network-
  // first, cache on success, fall back to any cached copy when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503 });
      })
  );
});

// ── Background sync for pending mutations ─────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'pryzm-pending-commands') {
    event.waitUntil(flushPendingCommands());
  }
});

async function flushPendingCommands() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'SW_FLUSH_PENDING_COMMANDS' });
  }
}

// ── Message channel for update notifications ──────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
