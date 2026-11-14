// Calvy Business service worker. Registered by the dashboard ONLY, with scope "/dashboard": it never controls a public page.
// (The old root-scope worker at /sw.js now just removes itself; see public/sw.js.)
//
// Static files only. It NEVER stores a signed-in page or an API answer: those carry customer data, so they are always fetched
// from the network. What it keeps: the hashed build files (/_next/static), the app icons, and one static "you're offline" page
// that contains no business or customer data.
const CACHE = "calvy-app-v1";
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
// Only a path inside the app (/dashboard...) is ever opened from an alert: nothing else, and never another site.
const safePath = (u) => (typeof u === "string" && (u === "/dashboard" || u.startsWith("/dashboard/") || u.startsWith("/dashboard?")) ? u : "/dashboard");

// Repeated alerts of one kind share a tag, so they REPLACE each other instead of piling up, and read "3 new bookings".
const GROUP_NOUN = {
  booking_new: "new bookings",
  booking_cancelled: "cancellations",
  booking_rescheduled: "rescheduled bookings",
  queue: "queue updates",
  payment: "payments received",
  reminder: "reminders",
};
const listPath = (url) => safePath(url).split("?")[0];

// The app icon badge counts the alerts still on the lock screen (what has not been looked at yet). Where the Badging API is missing nothing happens.
const updateBadge = async () => {
  try {
    const list = self.registration.getNotifications ? await self.registration.getNotifications() : [];
    const n = list.reduce((sum, x) => sum + ((x.data && x.data.count) || 1), 0);
    if (n > 0 && self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (e) { /* no badge support: fine */ }
};

self.addEventListener("push", (event) => {
  let data = {};
  try { if (event.data) data = event.data.json(); } catch (e) { /* not JSON: show the default */ }
  let title = typeof data.title === "string" && data.title ? data.title : "Calvy";
  let body = typeof data.body === "string" ? data.body : "You have a new notification";
  let url = safePath(data.url);
  const tag = typeof data.tag === "string" ? data.tag : "calvy";
  const noun = typeof data.kind === "string" ? GROUP_NOUN[data.kind] : undefined;

  event.waitUntil((async () => {
    let count = 1;
    if (noun && self.registration.getNotifications) {
      const same = await self.registration.getNotifications({ tag });
      const previous = same[0] && same[0].data ? same[0].data.count || 1 : 0;
      count = previous + 1;
      if (count > 1) { body = "Latest: " + body; title = count + " " + noun; url = listPath(url); }
    }
    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      renotify: true, // a replacing alert still buzzes once
      data: { url, count },
    });
    await updateBadge();
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = list.find((c) => c.url.startsWith(self.location.origin + "/dashboard"));
    if (existing) { await existing.focus(); await existing.navigate(url); } else { await self.clients.openWindow(url); }
    await updateBadge();
  })());
});

self.addEventListener("notificationclose", (event) => { event.waitUntil(updateBadge()); });

// The browser replaced or dropped this device's push subscription: register the new one for the signed-in person. If that is not
// possible from here, the app does it the next time it is opened.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    } catch (e) { /* the app re-subscribes on its next open */ }
  })());
});
