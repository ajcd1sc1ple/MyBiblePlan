/* Basic offline cache for MyBiblePlan */
const CACHE_NAME = "mybibleplan-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./plan.json",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle GET
  if (request.method !== "GET") return;

  // Network-first for external API calls, cache-first for local assets
  const isSameOrigin = new URL(request.url).origin === self.location.origin;

  if (!isSameOrigin) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

