import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import vm from "vm";
import { NextRequest } from "next/server";

// ── the worker (public/app-sw.js) in a sandbox with a fake notification list and badge ───────────────────────────────────
type Listener = (e: any) => void;
function loadSw() {
  const listeners: Record<string, Listener[]> = {};
  const shown: { title: string; options: any }[] = [];
  const badge: (number | "clear")[] = [];
  const subscribed: unknown[] = [];
  const posts: { url: string; body: string }[] = [];
  const opened: string[] = [];
  const nav: string[] = [];
  const self: any = {
    addEventListener: (t: string, fn: Listener) => { (listeners[t] ??= []).push(fn); },
    location: { origin: "https://app.example" },
    skipWaiting: () => {},
    navigator: { setAppBadge: async (n: number) => { badge.push(n); }, clearAppBadge: async () => { badge.push("clear"); } },
    clients: {
      claim: async () => {},
      matchAll: async () => [{ url: "https://app.example/dashboard", focus: async () => {}, navigate: async (u: string) => { nav.push(u); } }],
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
  const ctx = vm.createContext({ self, caches: { keys: async () => [], has: async () => false, delete: async () => true, open: async () => ({ addAll: async () => {}, put: async () => {} }), match: async () => undefined }, URL, Response, Request, fetch: async (u: string, init: RequestInit) => { posts.push({ url: u, body: String(init?.body) }); return new Response("{}"); } });
  vm.runInContext(readFileSync("public/app-sw.js", "utf8"), ctx);
  const fire = async (type: string, event: any) => { for (const fn of listeners[type] ?? []) fn(event); await Promise.all(event.__waits ?? []); };
  const ev = (extra: Record<string, unknown> = {}) => { const e: any = { __waits: [] as Promise<unknown>[], waitUntil: (p: Promise<unknown>) => e.__waits.push(p), ...extra }; return e; };
  const push = (data: object) => fire("push", ev({ data: { json: () => data } }));
  return { fire, ev, push, shown, badge, subscribed, posts, opened, nav, listeners };
}

describe("alerts: grouped, replacing, with an app badge", () => {
  it("repeated alerts of one kind replace each other and read '3 new bookings' (no pile-up)", async () => {
    const sw = loadSw();
    const base = { title: "New booking received", tag: "new-booking", kind: "booking_new" };
    await sw.push({ ...base, body: "Riya K. · Haircut · 3:30 pm", url: "/dashboard/appointments?open=a1" });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({ title: "New booking received", options: { data: { url: "/dashboard/appointments?open=a1", count: 1 }, renotify: true } });
    await sw.push({ ...base, body: "Sam P. · Colour · 4:00 pm", url: "/dashboard/appointments?open=a2" });
    await sw.push({ ...base, body: "Lena O. · Cut · 5:00 pm", url: "/dashboard/appointments?open=a3" });
    expect(sw.shown).toHaveLength(1); // one alert, not three
    expect(sw.shown[0].title).toBe("3 new bookings");
    expect(sw.shown[0].options.body).toBe("Latest: Lena O. · Cut · 5:00 pm");
    expect(sw.shown[0].options.data.url).toBe("/dashboard/appointments"); // several: the list; one: that exact booking
  });
  it("different kinds do not merge; the badge is the number of unseen alerts", async () => {
    const sw = loadSw();
    await sw.push({ title: "New booking received", body: "x", tag: "new-booking", kind: "booking_new", url: "/dashboard/appointments?open=a1" });
    await sw.push({ title: "New booking received", body: "y", tag: "new-booking", kind: "booking_new", url: "/dashboard/appointments?open=a2" });
    await sw.push({ title: "Token moved", body: "z", tag: "customer-token-move", kind: "queue", url: "/dashboard/queue" });
    expect(sw.shown.map((n) => n.title).sort()).toEqual(["2 new bookings", "Token moved"]);
    expect(sw.badge.at(-1)).toBe(3); // 2 bookings + 1 queue update
  });
  it("a tap opens the exact booking (the app opens a detail from ?open=) and the badge drops", async () => {
    const sw = loadSw();
    await sw.push({ title: "New booking received", body: "x", tag: "new-booking", kind: "booking_new", url: "/dashboard/appointments?open=a1" });
    sw.shown.length = 0; // the person tapped it: it is gone from the list
    await sw.fire("notificationclick", sw.ev({ notification: { close: () => {}, data: { url: "/dashboard/appointments?open=a1" } } }));
    expect(sw.nav).toEqual(["/dashboard/appointments?open=a1"]);
    expect(sw.badge.at(-1)).toBe("clear");
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
  it("healthy subscription: just confirms it to the server", async () => {
    const { ensurePushSubscription, markPushEnabled } = await import("@/lib/pwa");
    markPushEnabled("u1");
    current = (globalThis as any).__mk("https://push.example/ok", Date.now() + 86_400_000);
    expect(await ensurePushSubscription("u1")).toBe("ok");
    expect(subscribes).toEqual([]);
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
vi.mock("@/lib/prisma", () => ({ prisma: { pushDevice: { findUnique: m.findUnique, deleteMany: m.deleteMany } } }));
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
