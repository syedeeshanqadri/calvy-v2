// RETIRED. The business app's service worker is /app-sw.js and controls only /dashboard.
// Devices that installed the earlier worker (scope "/", which also controlled public pages) fetch this file on their next
// visit: it deletes every cache it can see and unregisters itself, so public pages end up with NO controlling worker.
// It has no fetch handler: it never answers a request.
self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    })(),
  );
});
