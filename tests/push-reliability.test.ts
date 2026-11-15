import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import vm from "vm";
import { NextRequest } from "next/server";

// ── the worker (public/app-sw.js) in a sandbox with a fake notification list and badge ───────────────────────────────────
type Listener = (e: any) => void;
function loadSw(opts: { windows?: { visibilityState: string }[]; fetchOk?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const shown: { title: string; options: any }[] = [];
  const badge: (number | "clear")[] = [];
  const subscribed: unknown[] = [];
  const posts: { url: string; body: string; method?: string }[] = [];
  const forwarded: unknown[] = [];
  const opened: string[] = [];
  const nav: string[] = [];
  const self: any = {
    addEventListener: (t: string, fn: Listener) => { (listeners[t] ??= []).push(fn); },
    location: { origin: "https://app.example" },
    skipWaiting: () => {},
    navigator: { setAppBadge: async (n: number) => { badge.push(n); }, clearAppBadge: async () => { badge.push("clear"); } },
    clients: {
      claim: async () => {},
      matchAll: async () => (opts.windows ?? [{ visibilityState: "hidden" }]).map((w) => ({ url: "https://app.example/dashboard", visibilityState: w.visibilityState, postMessage: (m: unknown) => { forwarded.push(m); }, focus: async () => {}, navigate: async (u: string) => { nav.push(u); } })),
      openWindow: async (u: string) => { opened.push(u); },
    },
    registration: {
      getNotifications: async (f?: { tag?: string }) => shown.filter((n) => !f?.tag || n.options.tag === f.tag).map((n) => ({ data: n.options.data, tag: n.options.tag })),
      showNotification: async (title: string, options: any) => {
        const i = shown.findIndex((n) => n.options.tag === options.tag);
        if (i >= 0) shown.splice(i, 1); // same tag REPLACES the older alert
        shown.push({ title, options });
      },
      pushManager: { subscribe: async (o: unknown) => { subscribed.push(o); return { toJSON: () => ({ endpoint: "https://push.example/new", keys: { p256dh: "p", auth: "a" } }) }; } },
    },
  };
  const ctx = vm.createContext({ self, caches: { keys: async () => [], has: async () => false, delete: async () => true, open: async () => ({ addAll: async () => {}, put: async () => {} }), match: async () => undefined }, URL, Response, Request, fetch: async (u: string, init: RequestInit) => { posts.push({ url: u, body: String(init?.body), method: init?.method }); return new Response("{}", { status: opts.fetchOk === false ? 500 : 200 }); } });
  vm.runInContext(readFileSync("public/app-sw.js", "utf8"), ctx);
  const fire = async (type: string, event: any) => { for (const fn of listeners[type] ?? []) fn(event); await Promise.all(event.__waits ?? []); };
  const ev = (extra: Record<string, unknown> = {}) => { const e: any = { __waits: [] as Promise<unknown>[], waitUntil: (p: Promise<unknown>) => e.__waits.push(p), ...extra }; return e; };
  const push = (data: object) => fire("push", ev({ data: { json: () => data } }));
  return { fire, ev, push, shown, badge, subscribed, posts, opened, nav, listeners, forwarded };
}

describe("alerts you cannot miss: one per booking, persistent, loud, with actions and a badge", () => {
  const booking = (id: string, extra: object = {}) => ({ title: "New booking received", body: `Riya K. · Haircut · ${id}`, tag: "new-booking", kind: "booking_new", url: `/dashboard/appointments?open=${id}`, ts: 1_700_000_000_000, ...extra });
  it("every booking is its own notification: a new one never silently replaces an earlier one, and each one renotifies", async () => {
    const sw = loadSw();
    await sw.push(booking("a1"));
    await sw.push(booking("a2"));
    await sw.push(booking("a3"));
    expect(sw.shown).toHaveLength(3);
    expect(new Set(sw.shown.map((n) => n.options.tag)).size).toBe(3);
    expect(sw.shown[0].options.tag).toBe("new-booking:a1");
    for (const n of sw.shown) expect(n.options.renotify).toBe(true);
    await sw.push(booking("a2")); // the SAME booking again replaces itself (no duplicate)
    expect(sw.shown).toHaveLength(3);
  });
  it("closed or locked: requireInteraction, not silent, vibration pattern, badge, icon, timestamp", async () => {
    const sw = loadSw({ windows: [] });
    await sw.push(booking("a1"));
    expect(sw.shown[0].options).toMatchObject({ requireInteraction: true, silent: false, vibrate: [300, 100, 300, 100, 300], badge: "/icons/icon-192.png", icon: "/icons/icon-192.png", timestamp: 1_700_000_000_000 });
    expect(sw.forwarded).toEqual([]);
  });
  it("offers Open and Mark arrived on a new booking, only Open elsewhere", async () => {
    const sw = loadSw();
    await sw.push(booking("a1"));
    await sw.push({ title: "Token moved", body: "x", tag: "q", kind: "queue", url: "/dashboard/queue" });
    expect(sw.shown[0].options.actions).toEqual([{ action: "open", title: "Open" }, { action: "arrived", title: "Mark arrived" }]);
    expect(sw.shown[1].options.actions).toEqual([{ action: "open", title: "Open" }]);
  });
  it("app open and in front: the alert is handed to the page (chime, vibration, card) and the system alert is silent", async () => {
    const sw = loadSw({ windows: [{ visibilityState: "visible" }] });
    await sw.push(booking("a1"));
    expect(sw.forwarded).toEqual([{ type: "calvy-alert", alert: { title: "New booking received", body: "Riya K. · Haircut · a1", url: "/dashboard/appointments?open=a1", kind: "booking_new" } }]);
    expect(sw.shown[0].options.silent).toBe(true);
    expect(sw.shown[0].options.requireInteraction).toBe(true); // iOS needs a visible notification for every push
  });
  it("a hidden window does not count as 'open': the system alert makes its sound", async () => {
    const sw = loadSw({ windows: [{ visibilityState: "hidden" }] });
    await sw.push(booking("a1"));
    expect(sw.shown[0].options.silent).toBe(false);
    expect(sw.forwarded).toEqual([]);
  });
  it("the badge is the number of alerts still on the lock screen", async () => {
    const sw = loadSw();
    await sw.push(booking("a1"));
    await sw.push(booking("a2"));
    await sw.push({ title: "Token moved", body: "z", tag: "customer-token-move", kind: "queue", url: "/dashboard/queue" });
    expect(sw.badge.at(-1)).toBe(3);
  });
  it("a tap on the alert opens that exact booking and the badge drops", async () => {
    const sw = loadSw();
    await sw.push(booking("a1"));
    sw.shown.length = 0;
    await sw.fire("notificationclick", sw.ev({ notification: { close: () => {}, data: { url: "/dashboard/appointments?open=a1", appointmentId: "a1" } } }));
    expect(sw.nav).toEqual(["/dashboard/appointments?open=a1"]);
    expect(sw.badge.at(-1)).toBe("clear");
  });
  it("'Mark arrived' marks it from the alert without opening anything", async () => {
    const sw = loadSw();
    await sw.fire("notificationclick", sw.ev({ action: "arrived", notification: { close: () => {}, data: { url: "/dashboard/appointments?open=a1", appointmentId: "a1" } } }));
    expect(sw.posts).toEqual([{ url: "/api/appointments/a1/arrived", body: "undefined", method: "POST" }]);
    expect(sw.nav).toEqual([]);
    expect(sw.opened).toEqual([]);
  });
  it("if 'Mark arrived' fails the booking opens, so nothing is lost", async () => {
    const sw = loadSw({ fetchOk: false });
    await sw.fire("notificationclick", sw.ev({ action: "arrived", notification: { close: () => {}, data: { url: "/dashboard/appointments?open=a1", appointmentId: "a1" } } }));
    expect(sw.nav).toEqual(["/dashboard/appointments?open=a1"]);
  });
  it("a tap can only open the business app, whatever the payload says", async () => {
    const sw = loadSw();
    await sw.fire("notificationclick", sw.ev({ notification: { close: () => {}, data: { url: "https://evil.example/x" } } }));
    await sw.fire("notificationclick", sw.ev({ notification: { close: () => {}, data: { url: "/my/bookings" } } }));
    expect(sw.nav).toEqual(["/dashboard", "/dashboard"]);
  });
  it("closing an alert recomputes the badge", async () => {
    const sw = loadSw();
    await sw.fire("notificationclose", sw.ev({}));
    expect(sw.badge.at(-1)).toBe("clear");
  });
});

describe("the browser replaced this device's subscription", () => {
  it("the worker subscribes again with the same key and registers it for the signed-in person (cookies included)", async () => {
    const sw = loadSw();
    await sw.fire("pushsubscriptionchange", sw.ev({ oldSubscription: { options: { applicationServerKey: new Uint8Array([1, 2, 3]) } } }));
    expect(sw.subscribed).toEqual([{ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) }]);
    expect(sw.posts).toHaveLength(1);
    expect(sw.posts[0].url).toBe("/api/push/subscribe");
    expect(JSON.parse(sw.posts[0].body)).toEqual({ endpoint: "https://push.example/new", keys: { p256dh: "p", auth: "a" } });
  });
  it("with no old key it does nothing (the app re-subscribes on the next open)", async () => {
    const sw = loadSw();
    await sw.fire("pushsubscriptionchange", sw.ev({ oldSubscription: null }));
    expect(sw.subscribed).toEqual([]);
  });
});

// ── re-subscribe on app open (lib/pwa.ts) ──────────────────────────────────────────────────────────────────────────────────
describe("ensurePushSubscription: silent only for the person who turned alerts on here", () => {
  const store = new Map<string, string>();
  let current: { endpoint: string; expirationTime: number | null; unsubscribe: () => Promise<boolean>; toJSON: () => unknown } | null;
  const subscribes: unknown[] = [];
  const fetched: string[] = [];
  beforeEach(() => {
    store.clear(); subscribes.length = 0; fetched.length = 0; current = null;
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("fetch", async (u: string) => { fetched.push(u); return new Response("{}", { status: 200 }); });
    const mk = (endpoint: string, expirationTime: number | null = null) => ({ endpoint, expirationTime, unsubscribe: async () => true, toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }) });
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => current, subscribe: async (o: unknown) => { subscribes.push(o); current = mk("https://push.example/fresh"); return current; } } }) }, userAgent: "x", platform: "x", maxTouchPoints: 0 });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "AQID";
    (globalThis as any).__mk = mk;
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; });

  it("another person on a shared phone is NOT subscribed silently", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("owner-1");
    expect(await ensurePushSubscription("receptionist-2")).toBe("skipped");
    expect(subscribes).toEqual([]);
  });
  it("permission not granted: nothing, and it never asks", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    markPushEnabled("u1");
    expect(await ensurePushSubscription("u1")).toBe("skipped");
    expect(((globalThis as any).Notification.requestPermission as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it("missing subscription: subscribed again and registered", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    expect(await ensurePushSubscription("u1")).toBe("resubscribed");
    expect(subscribes).toHaveLength(1);
    expect(fetched).toEqual(["/api/push/subscribe"]);
  });
  it("expired subscription: replaced", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    current = (globalThis as any).__mk("https://push.example/old", Date.now() - 1000);
    expect(await ensurePushSubscription("u1")).toBe("resubscribed");
  });
  it("healthy subscription the server knows: nothing to do", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    current = (globalThis as any).__mk("https://push.example/ok", Date.now() + 86_400_000);
    vi.stubGlobal("fetch", async (u: string) => { fetched.push(u); return new Response(JSON.stringify({ registered: true }), { status: 200 }); });
    expect(await ensurePushSubscription("u1")).toBe("ok");
    expect(subscribes).toEqual([]);
  });
  it("a subscription the SERVER dropped (the push service rejected it) is not quietly re-added: the person is asked to re-enable", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    current = (globalThis as any).__mk("https://push.example/rejected", Date.now() + 86_400_000);
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => { fetched.push(`${init?.method ?? "GET"} ${u}`); return new Response(JSON.stringify({ registered: false }), { status: 200 }); });
    expect(await ensurePushSubscription("u1")).toBe("needs-reenable");
    expect(fetched.some((f) => f.startsWith("POST"))).toBe(false); // never re-registered behind their back
  });
  it("a subscription made with a DIFFERENT key than this build's is unsubscribed and replaced", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    const unsub = vi.fn(async () => true);
    const other = new Uint8Array([9, 9, 9, 9]); // not the build's key (AQID)
    current = { ...(globalThis as any).__mk("https://push.example/old-key", Date.now() + 86_400_000), unsubscribe: unsub, options: { applicationServerKey: other.buffer } } as never;
    expect(await ensurePushSubscription("u1")).toBe("resubscribed");
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(subscribes).toHaveLength(1);
  });
  it("a subscription made with the SAME key is reused (no needless churn)", async () => {
    const { subscribeFresh } = await import("@/lib/pwa");
    const same = new Uint8Array([1, 2, 3]); // "AQID"
    const unsub = vi.fn(async () => true);
    current = { ...(globalThis as any).__mk("https://push.example/same", Date.now() + 86_400_000), unsubscribe: unsub, options: { applicationServerKey: same.buffer } } as never;
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => { throw new Error("must not subscribe again"); } } };
    expect(await subscribeFresh(reg as never)).toBe(current);
    expect(unsub).not.toHaveBeenCalled();
  });
  it("force (Re-enable) always starts clean", async () => {
    const { subscribeFresh } = await import("@/lib/pwa");
    const unsub = vi.fn(async () => true);
    current = { ...(globalThis as any).__mk("https://push.example/x", Date.now() + 86_400_000), unsubscribe: unsub, options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer } } as never;
    const fresh = (globalThis as any).__mk("https://push.example/fresh");
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => fresh } };
    expect(await subscribeFresh(reg as never, { force: true })).toBe(fresh);
    expect(unsub).toHaveBeenCalledTimes(1);
  });
  it("turning alerts off or signing out forgets the person", async () => {
    const { ensurePushSubscription, markPushEnabled, clearPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    clearPushEnabled();
    expect(await ensurePushSubscription("u1")).toBe("skipped");
  });
});

describe("iPhone: install first", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("pushBlock says 'ios-install' for iPhone in a Safari tab, nothing once installed", async () => {
    const { pushBlock } = await import("@/lib/pwa");
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), PushManager: {}, Notification: { permission: "default" } });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5, serviceWorker: {} });
    expect(pushBlock()).toBe("ios-install");
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), PushManager: {}, Notification: { permission: "default" } });
    vi.stubGlobal("Notification", { permission: "default" });
    expect(pushBlock()).toBeNull();
  });
});

// ── the test endpoint ────────────────────────────────────────────────────────────────────────────────────────────────────
const m = vi.hoisted(() => ({ accessSession: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), deliverPush: vi.fn(), rateLimit: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/access", () => ({ accessSession: m.accessSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { pushDevice: { findUnique: m.findUnique, deleteMany: m.deleteMany, update: vi.fn(async () => ({})) } } }));
vi.mock("@/lib/push", () => ({ deliverPush: m.deliverPush, isPushConfigured: m.configured }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: m.rateLimit }));
import { POST as testRoute } from "@/app/api/push/test/route";

describe("POST /api/push/test", () => {
  const req = (body: unknown) => new NextRequest("http://x/api/push/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  beforeEach(() => { vi.clearAllMocks(); m.configured.mockReturnValue(true); m.rateLimit.mockResolvedValue({ ok: true }); m.accessSession.mockResolvedValue({ access: { userId: "u1" } }); });
  it("401 signed out; 503 when push is not configured", async () => {
    m.accessSession.mockResolvedValue(null);
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(401);
    m.accessSession.mockResolvedValue({ access: { userId: "u1" } }); m.configured.mockReturnValue(false);
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(503);
  });
  it("only the owner of the device can test it (another person's endpoint is a 404, nothing is sent)", async () => {
    m.findUnique.mockResolvedValue({ id: "d1", userId: "someone-else", endpoint: "https://p.example/1" });
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(404);
    expect(m.deliverPush).not.toHaveBeenCalled();
  });
  it("sends one 'Test from Calvy' alert to that device; an expired subscription removes it and says so", async () => {
    m.findUnique.mockResolvedValue({ id: "d1", userId: "u1", endpoint: "https://p.example/1", p256dh: "p", auth: "a" });
    m.deliverPush.mockResolvedValue({ kind: "sent" });
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(200);
    expect(m.deliverPush.mock.calls[0][1]).toMatchObject({ title: "Test from Calvy", tag: "test", kind: "test" });
    m.deliverPush.mockResolvedValue({ kind: "expired" });
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(410);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: "d1" } });
  });
  it("is rate limited", async () => {
    m.rateLimit.mockResolvedValue({ ok: false, retryAfter: 60 });
    expect((await testRoute(req({ endpoint: "https://p.example/1" }))).status).toBe(429);
  });
});

describe("wiring", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  const files = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.tsx?$/.test(f));
  it("permission is requested in ONE place, which runs only from a tap (never on load)", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("Notification.requestPermission"));
    expect(hits).toEqual(["components/dashboard/PushSetup.tsx"]);
    for (const f of ["components/dashboard/PushBanner.tsx", "app/dashboard/alerts/AlertsClient.tsx", "components/dashboard/Header.tsx"]) {
      const src = readFileSync(f, "utf8");
      // every call sits inside a click handler function, never in an effect body
      for (const m of src.matchAll(/requestPushPermission\(\)/g)) {
        const before = src.slice(Math.max(0, m.index! - 400), m.index!);
        expect(before, f).toMatch(/async function (enable|\w+)\(|onClick=\{async/);
        expect(before.lastIndexOf("useEffect"), f).toBeLessThan(before.lastIndexOf("async function") === -1 ? before.length : before.lastIndexOf("async function"));
      }
    }
  });
  it("new-booking alerts link to the exact booking, queue alerts to the queue", () => {
    expect(readFileSync("app/api/bookings/route.ts", "utf8")).toContain("url: `/dashboard/appointments?open=${appointmentId}`");
    expect(readFileSync("app/api/appointments/route.ts", "utf8")).toContain("url: `/dashboard/appointments?open=${appointment.id}`");
    expect(readFileSync("lib/customerTokenMove.ts", "utf8")).toContain('url: "/dashboard/queue"');
    expect(readFileSync("app/dashboard/appointments/AppointmentsClient.tsx", "utf8")).toContain('searchParams.get("open")');
  });
  it("the alert kind travels from the outbox to the device (for grouping)", () => {
    expect(readFileSync("lib/notifications/process.ts", "utf8")).toContain("kind: p.kind");
    expect(readFileSync("lib/notifications/channels.ts", "utf8")).toContain("kind: message.push?.kind");
  });
  it("Phone alerts has the test button and the install-first steps; the app clears the badge when opened", () => {
    const alerts = readFileSync("app/dashboard/alerts/AlertsClient.tsx", "utf8");
    expect(alerts).toContain("Send test notification");
    expect(alerts).toContain("IosInstallSteps");
    expect(readFileSync("components/dashboard/PushSetup.tsx", "utf8")).toContain("clearSeenAlerts");
  });
});

// ── the server's key pair and the subscribe check ───────────────────────────────────────────────────────────────────────
describe("VAPID pair and the subscribe check (the 403 'push service' failure)", () => {
  it("signingPublicKey is derived from the PRIVATE key; vapidPairMatches is false when the public key belongs to another pair", async () => {
    const { generateKeyPairSync } = await import("crypto");
    const mk = () => { const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" }); const jwk = privateKey.export({ format: "jwk" }) as { d: string; x: string; y: string };
      const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url"); return { priv: jwk.d, pub }; };
    const a = mk(), b = mk();
    vi.resetModules();
    process.env.VAPID_PRIVATE_KEY = a.priv; process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = a.pub;
    vi.doMock("web-push", () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
    let push = await vi.importActual<typeof import("@/lib/push")>("@/lib/push");
    expect(push.signingPublicKey()).toBe(a.pub);
    expect(push.vapidPairMatches()).toBe(true);
    vi.resetModules();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = b.pub; // a public key from a DIFFERENT pair: exactly the production failure
    push = await vi.importActual<typeof import("@/lib/push")>("@/lib/push");
    expect(push.signingPublicKey()).toBe(a.pub);
    expect(push.vapidPairMatches()).toBe(false);
    vi.doUnmock("web-push");
  });
});

describe("POST/GET /api/push/subscribe key check", () => {
  const s = vi.hoisted(() => ({ session: vi.fn(), upsert: vi.fn(), find: vi.fn(), signing: vi.fn() }));
  it("source: refuses a browser key that is not the key the server signs with (409 VAPID_MISMATCH) and answers 'registered'", () => {
    const src = readFileSync("app/api/push/subscribe/route.ts", "utf8");
    expect(src).toContain("signingPublicKey()");
    expect(src).toMatch(/normalizeKey\(applicationServerKey\) !== signing/);
    expect(src).toContain('code: "VAPID_MISMATCH"');
    expect(src).toContain("status: 409");
    expect(src).toContain("registered: mine");
    expect(src).toContain("keyMatches:");
    expect(src).toContain("lastPushAt:");
    void s;
  });
  it("the client sends the key it subscribed with, and the Alerts page offers 'Re-enable alerts on this device'", () => {
    expect(readFileSync("lib/pwa.ts", "utf8")).toContain("applicationServerKey: key");
    expect(readFileSync("app/dashboard/alerts/AlertsClient.tsx", "utf8")).toContain("Re-enable alerts on this device");
    expect(readFileSync("components/dashboard/PushBanner.tsx", "utf8")).toContain("Re-enable alerts on this device");
  });
});
