/* ============================================================
   Communic8 — Marketing & Sales Board
   Minimal service worker.

   What this does:
   - Caches the app's own files on first visit, so it still opens
     (and keeps working) even with no internet connection.
   - Required by most browsers before they'll offer "Add to Home
     Screen" / "Install app" for a site.

   What this does NOT do:
   - It does not sync your data anywhere. Your board's contents
     still live only in this browser's localStorage, same as
     before — this just makes the app shell itself load offline.
   ============================================================ */

const CACHE_NAME = "communic8-marketing-v1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./data-embedded.js",
  "./manifest.json",
  "./assets/icon-creation.png",
  "./assets/icon-application.png",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for navigation requests (so updates show up promptly),
  // falling back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
