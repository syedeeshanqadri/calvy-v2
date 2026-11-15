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

// Every booking is its own alert: the tag is unique per booking, so a new booking never silently replaces an earlier one, and renotify makes
// each one buzz/ring again. (Same booking again = same tag = replaced, which is right.)
const OPEN_ID = /[?&]open=([^&#]+)/;
const VIBRATE = [300, 100, 300, 100, 300];

// The app icon badge counts the alerts still on the lock screen (what has not been looked at yet). Where the Badging API is missing nothing happens.
const updateBadge = async () => {
  try {
    const list = self.registration.getNotifications ? await self.registration.getNotifications() : [];
    const n = list.length;
    if (n > 0 && self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (e) { /* no badge support: fine */ }
};

self.addEventListener("push", (event) => {
  let data = {};
  try { if (event.data) data = event.data.json(); } catch (e) { /* not JSON: show the default */ }
  const title = typeof data.title === "string" && data.title ? data.title : "Calvy";
  const body = typeof data.body === "string" ? data.body : "You have a new notification";
  const url = safePath(data.url);
  const kind = typeof data.kind === "string" ? data.kind : undefined;
  const match = OPEN_ID.exec(url);
  const appointmentId = match ? decodeURIComponent(match[1]) : null;
  const base = typeof data.tag === "string" ? data.tag : "calvy";
  const tag = base + ":" + (appointmentId || String(Date.now()));
  const timestamp = typeof data.ts === "number" ? data.ts : Date.now();

  event.waitUntil((async () => {
    // If the app is open and in front, hand the alert to it (chime, vibration, card) and keep the system alert quiet: one sound, not two.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = wins.filter((w) => w.visibilityState === "visible");
    visible.forEach((w) => w.postMessage({ type: "calvy-alert", alert: { title, body, url, kind } }));
    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      renotify: true,
      requireInteraction: true, // stays until tapped, where the platform supports it
      silent: visible.length > 0,
      vibrate: VIBRATE,
      timestamp,
      actions: kind === "booking_new" && appointmentId ? [{ action: "open", title: "Open" }, { action: "arrived", title: "Mark arrived" }] : [{ action: "open", title: "Open" }],
      data: { url, appointmentId },
    });
    await updateBadge();
  })());
});

const openOrFocus = async (url) => {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = list.find((c) => c.url.startsWith(self.location.origin + "/dashboard"));
  if (existing) { await existing.focus(); await existing.navigate(url); } else { await self.clients.openWindow(url); }
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = safePath(d.url);
  if (event.action === "arrived" && d.appointmentId) {
    // "Mark arrived" straight from the alert; if that fails, open the booking so nothing is lost.
    event.waitUntil((async () => {
      let ok = false;
      try { ok = (await fetch("/api/appointments/" + encodeURIComponent(d.appointmentId) + "/arrived", { method: "POST", credentials: "same-origin" })).ok; } catch (e) { /* offline */ }
      if (!ok) await openOrFocus(url);
      await updateBadge();
    })());
    return;
  }
  event.waitUntil(openOrFocus(url).then(updateBadge));
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
