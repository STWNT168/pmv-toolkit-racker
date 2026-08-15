/**
 * sw.js
 * Caches the app shell so the PWA loads and is usable offline.
 * Data (Google Sheets records) is NOT cached here — that's handled by
 * IndexedDB in storage.js. This worker only caches static assets.
 *
 * Bump CACHE_NAME's version suffix whenever you change any cached file,
 * so returning users get the new version instead of a stale cache.
 */

const CACHE_NAME = "pmv-toolkit-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/calculations.js",
  "./js/validation.js",
  "./js/storage.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/sync.js",
  "./js/ui.js",
  "./js/spm.js",
  "./js/dashboard.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls to Apps Script — always go to network so data is fresh.
  // (Offline data entry is handled separately via IndexedDB, not the SW cache.)
  if (url.hostname.includes("script.google.com")) {
    event.respondWith(fetch(event.request).catch(() => new Response(
      JSON.stringify({ success: false, message: "Offline — request queued locally." }),
      { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // App shell: cache-first, falling back to network, so the app opens instantly
  // and still works with no connectivity at all.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
