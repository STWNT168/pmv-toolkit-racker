/**
 * PMV Toolkit service worker.
 * Bump the cache version whenever app-shell files change.
 */
const CACHE_NAME = "pmv-toolkit-cache-v2";

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

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache Apps Script API requests.
  if (url.hostname.includes("script.google.com")) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation: cached app shell first, then network.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then(cached =>
        cached || fetch(request).catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  // Static assets: cache first, then network.
  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
