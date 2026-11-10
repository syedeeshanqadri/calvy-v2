// Calvy Business service worker.
//
// Static files only. It NEVER stores a signed-in page or an API answer: those carry customer data, so they are always fetched
// from the network. What it keeps: the hashed build files (/_next/static), the app icons, and one static "you're offline" page
// that contains no business or customer data.
const CACHE = "calvy-static-v3";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"];
const LEGACY_CACHE = "calvy-v2"; // the first service worker cached signed-in dashboard pages here: it must go

// Only these paths are ever put in the cache.
const STATIC = /^\/(_next\/static\/|icons\/)/;

const purgeOthers = () =>
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const hadLegacy = await caches.has(LEGACY_CACHE);
      await purgeOthers(); // wipes every old cache, including cached dashboard HTML, as soon as this worker is installed
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE).catch(() => {});
      // Replacing the old worker: take over at once, so it cannot cache another page. Otherwise wait until the person taps "Refresh".
      if (hadLegacy) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(purgeOthers().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cached, never touched: network only

  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Pages: always the network. Offline, the static offline page. A page is never written to the cache.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE).then((r) => r || new Response("Offline", { status: 503 }))));
  }
});

// ─── Push ─────────────────────────────────────────────────────────────────────
// Only a path inside this app is ever opened from an alert ("//host" and "/\\host" would leave the site).
const safePath = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\") ? u : "/dashboard");
self.addEventListener("push", (event) => {
  let data = {};
  try { if (event.data) data = event.data.json(); } catch (e) { /* not JSON: show the default */ }
  const title = typeof data.title === "string" && data.title ? data.title : "Calvy";
  const body = typeof data.body === "string" ? data.body : "You have a new notification";
  const url = safePath(data.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : "calvy",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.startsWith(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate(url); }
      return self.clients.openWindow(url);
    }),
  );
});
