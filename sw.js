/* Enhanced offline cache for MyBiblePlan PWA */
const CACHE_NAME = "mybibleplan-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./plan.json",
  "./manifest.json",
  "./icon.svg"
];

// Cache external resources
const EXTERNAL_CACHE = [
  "https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=Inter:wght@400;600&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(ASSETS).catch((err) => {
          console.warn("Failed to cache some assets:", err);
        });
      }),
      caches.open(CACHE_NAME + "-external").then((cache) => {
        return Promise.allSettled(
          EXTERNAL_CACHE.map((url) => 
            fetch(url).then((response) => {
              if (response.ok) cache.put(url, response);
            }).catch(() => {})
          )
        );
      })
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && k !== CACHE_NAME + "-external") {
            return caches.delete(k);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle GET requests
  if (request.method !== "GET") return;

  // Handle external API calls (bible-api.com) - network first, cache fallback
  if (url.hostname === "bible-api.com" || url.hostname === "www.bible-api.com") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME + "-api").then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return a basic error response if nothing cached
            return new Response(
              JSON.stringify({ error: "Offline - no cached data available" }),
              { 
                status: 503,
                headers: { "Content-Type": "application/json" }
              }
            );
          });
        })
    );
    return;
  }

  // Handle Firebase requests - network only (don't cache)
  if (url.hostname.includes("firebase") || url.hostname.includes("googleapis.com")) {
    event.respondWith(fetch(request));
    return;
  }

  // Handle local assets - cache first, network fallback
  const isSameOrigin = url.origin === self.location.origin;
  if (isSameOrigin || EXTERNAL_CACHE.includes(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Cache the response for future use
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: network first
  event.respondWith(fetch(request));
});

