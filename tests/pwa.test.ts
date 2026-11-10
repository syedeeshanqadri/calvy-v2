import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import vm from "vm";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { buildAssetLinks } from "@/lib/assetlinks";
import { GET as assetlinksRoute } from "@/app/.well-known/assetlinks.json/route";

// The installable business app: manifest, icons, the service worker's cache rules, the offline page and the TWA verification file.

type Listener = (e: any) => void;

/** Run public/sw.js in a sandbox with a fake cache store, and return handles to drive it. */
function loadSw(opts: { caches?: Record<string, Record<string, string>>; fetchImpl?: (req: Request) => Promise<Response> } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const store = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(opts.caches ?? {})) store.set(name, new Map(Object.entries(entries).map(([u, body]) => [u, new Response(body)])));
  const puts: string[] = [];
  const keyOf = (r: Request | string) => (typeof r === "string" ? r : new URL(r.url).pathname);
  const cacheApi = {
    keys: async () => [...store.keys()],
    has: async (n: string) => store.has(n),
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      if (!store.has(n)) store.set(n, new Map());
      const c = store.get(n)!;
      return {
        addAll: async (urls: string[]) => { for (const u of urls) c.set(u, new Response(`precached ${u}`)); },
        put: async (r: Request | string, res: Response) => { puts.push(keyOf(r)); c.set(keyOf(r), res); },
      };
    },
    match: async (r: Request | string) => { for (const c of store.values()) { const hit = c.get(keyOf(r)); if (hit) return hit.clone(); } return undefined; },
  };
  const calls = { skipWaiting: 0, claim: 0, shown: [] as { title: string; options: any }[], opened: [] as string[] };
  const fetchLog: string[] = [];
  const self: any = {
    addEventListener: (t: string, fn: Listener) => { (listeners[t] ??= []).push(fn); },
    location: { origin: "https://app.example" },
    skipWaiting: async () => { calls.skipWaiting++; },
    clients: { claim: async () => { calls.claim++; }, matchAll: async () => [], openWindow: async (u: string) => { calls.opened.push(u); } },
    registration: { showNotification: async (title: string, options: any) => { calls.shown.push({ title, options }); } },
  };
  const ctx = vm.createContext({ self, caches: cacheApi, URL, Response, Request, fetch: async (r: Request) => { fetchLog.push(new URL(r.url).pathname); const res = await (opts.fetchImpl ?? (async () => new Response("net", { status: 200 })))(r); Object.defineProperty(res, "type", { value: "basic" }); return res; } });
  vm.runInContext(readFileSync("public/sw.js", "utf8"), ctx);

  const fire = async (type: string, event: any) => { for (const fn of listeners[type] ?? []) fn(event); await Promise.all(event.__waits ?? []); };
  const fetchEvent = async (url: string, init: { method?: string; mode?: string } = {}) => {
    const req = new Request(url, { method: init.method ?? "GET" });
    Object.defineProperty(req, "mode", { value: init.mode ?? "no-cors" });
    let responded: Promise<Response> | null = null;
    await fire("fetch", { request: req, respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); } });
    return { handled: responded !== null, response: responded ? await (responded as Promise<Response>) : null };
  };
  const waitEvent = (extra: Record<string, unknown> = {}) => { const e: any = { __waits: [] as Promise<unknown>[], waitUntil: (p: Promise<unknown>) => e.__waits.push(p), ...extra }; return e; };
  return { fire, fetchEvent, waitEvent, store, puts, calls, fetchLog };
}

describe("service worker: what it caches and what it never touches", () => {
  const ORIGIN = "https://app.example";

  it("never touches an API call: it is not even answered by the worker", async () => {
    const sw = loadSw();
    for (const path of ["/api/appointments", "/api/customers/export", "/api/auth/session", "/api/icon?size=192"]) {
      const r = await sw.fetchEvent(`${ORIGIN}${path}`);
      expect(r.handled, path).toBe(false);
    }
    expect(sw.puts).toEqual([]);
    expect(sw.fetchLog).toEqual([]);
  });

  it("never touches a write (POST, PATCH, DELETE)", async () => {
    const sw = loadSw();
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) expect((await sw.fetchEvent(`${ORIGIN}/dashboard/clients`, { method })).handled).toBe(false);
  });

  it("a dashboard page is network-only: served from the network and NEVER written to the cache", async () => {
    const sw = loadSw({ fetchImpl: async () => new Response("<html>Riya Kapoor +91 98765 43210</html>", { status: 200 }) });
    const r = await sw.fetchEvent(`${ORIGIN}/dashboard/appointments`, { mode: "navigate" });
    expect(r.handled).toBe(true);
    expect(await r.response!.text()).toContain("Riya Kapoor");
    expect(sw.puts).toEqual([]); // nothing stored, on any path
    for (const c of sw.store.values()) expect([...c.keys()].some((k) => k.startsWith("/dashboard"))).toBe(false);
    // ...and a second visit still goes to the network
    await sw.fetchEvent(`${ORIGIN}/dashboard/appointments`, { mode: "navigate" });
    expect(sw.fetchLog.filter((p) => p === "/dashboard/appointments")).toHaveLength(2);
  });

  it("offline, a page shows the static offline page (precached at install), with no business or customer data", async () => {
    const sw = loadSw({ fetchImpl: async () => { throw new TypeError("offline"); } });
    await sw.fire("install", sw.waitEvent());
    const r = await sw.fetchEvent(`${ORIGIN}/dashboard`, { mode: "navigate" });
    expect(await r.response!.text()).toBe("precached /offline.html");
  });

  it("hashed build files and icons are cached (cache-first); other same-origin files are left alone", async () => {
    const sw = loadSw();
    await sw.fetchEvent(`${ORIGIN}/_next/static/chunks/app-abc123.js`);
    await new Promise((r) => setTimeout(r, 0)); // the worker writes the cache in the background
    await sw.fetchEvent(`${ORIGIN}/_next/static/chunks/app-abc123.js`);
    expect(sw.puts).toEqual(["/_next/static/chunks/app-abc123.js"]);
    expect(sw.fetchLog).toEqual(["/_next/static/chunks/app-abc123.js"]); // the second came from the cache
    for (const path of ["/uploads/logo.png", "/dashboard/data.json", "/blog/post", "/_next/image?url=%2Fx.png&w=64&q=75"]) {
      const r = await sw.fetchEvent(`${ORIGIN}${path}`);
      expect(r.handled, path).toBe(false);
    }
    expect(sw.puts).toEqual(["/_next/static/chunks/app-abc123.js"]);
  });

  it("ignores other origins", async () => {
    const sw = loadSw();
    expect((await sw.fetchEvent("https://cdn.example/_next/static/x.js")).handled).toBe(false);
  });

  it("the precache list holds only the offline page and icons: no page, no API", () => {
    const src = readFileSync("public/sw.js", "utf8");
    const list = /const PRECACHE = \[([^\]]*)\]/.exec(src)![1];
    expect(src).toContain('const OFFLINE = "/offline.html"');
    expect(list).toContain("OFFLINE");
    expect(list).not.toMatch(/\/api|\/dashboard|\/my|\/admin/);
  });
});

describe("service worker: purging what the first worker cached, and the update flow", () => {
  it("on install it deletes EVERY old cache, including the legacy one that held signed-in dashboard pages", async () => {
    const sw = loadSw({ caches: { "calvy-v2": { "/dashboard": "<html>Riya Kapoor</html>", "/dashboard/clients": "<html>customers</html>" }, "other-old": { "/x": "y" } } });
    await sw.fire("install", sw.waitEvent());
    expect([...sw.store.keys()]).toEqual(["calvy-static-v3"]);
    expect(await caches_has(sw, "calvy-v2")).toBe(false);
  });
  it("it takes over at once when it replaces the legacy worker (so that one cannot cache another page)", async () => {
    const legacy = loadSw({ caches: { "calvy-v2": { "/dashboard": "x" } } });
    await legacy.fire("install", legacy.waitEvent());
    expect(legacy.calls.skipWaiting).toBe(1);
  });
  it("a normal update waits for the person to tap Refresh (message SKIP_WAITING)", async () => {
    const sw = loadSw({ caches: { "calvy-static-v2": { "/_next/static/a.js": "old" } } });
    await sw.fire("install", sw.waitEvent());
    expect(sw.calls.skipWaiting).toBe(0);
    await sw.fire("message", { data: { type: "SKIP_WAITING" } });
    expect(sw.calls.skipWaiting).toBe(1);
  });
  it("on activate it purges any other cache and claims the open pages", async () => {
    const sw = loadSw({ caches: { "calvy-v2": { "/dashboard": "x" }, "calvy-static-v3": { "/offline.html": "ok" } } });
    await sw.fire("activate", sw.waitEvent());
    expect([...sw.store.keys()]).toEqual(["calvy-static-v3"]);
    expect(sw.calls.claim).toBe(1);
  });
});
async function caches_has(sw: ReturnType<typeof loadSw>, name: string) { return sw.store.has(name); }

describe("service worker: push", () => {
  it("shows the alert and opens only a path inside the app", async () => {
    const sw = loadSw();
    await sw.fire("push", sw.waitEvent({ data: { json: () => ({ title: "New booking", body: "Riya K. · Haircut · 3:30 pm", url: "/dashboard/appointments", tag: "t1" }) } }));
    expect(sw.calls.shown[0]).toMatchObject({ title: "New booking", options: { body: "Riya K. · Haircut · 3:30 pm", tag: "t1", data: { url: "/dashboard/appointments" } } });
    await sw.fire("push", sw.waitEvent({ data: { json: () => ({ title: "x", body: "y", url: "https://evil.example/phish" }) } }));
    expect(sw.calls.shown[1].options.data.url).toBe("/dashboard");
    const clicked = { notification: { close: () => {}, data: { url: "//evil.example" } }, __waits: [] as Promise<unknown>[], waitUntil(p: Promise<unknown>) { this.__waits.push(p); } };
    await sw.fire("notificationclick", clicked);
    expect(sw.calls.opened).toEqual(["/dashboard"]);
  });
});

describe("offline page", () => {
  it("is static: no script, no fetch, no data, and the agreed words", () => {
    const html = readFileSync("public/offline.html", "utf8");
    expect(html).toContain("You're offline — reconnect to see live bookings.");
    expect(html).not.toMatch(/<script\s+src|fetch\(|XMLHttpRequest|\/api\//);
    expect(html).not.toMatch(/@|\+91/);
  });
});

describe("manifest and icons", () => {
  const m = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  it("is Calvy Business, opens the dashboard, standalone", () => {
    expect(m).toMatchObject({ name: "Calvy Business", short_name: "Calvy", start_url: "/dashboard", display: "standalone", theme_color: "#0284c7" });
  });
  it("has real 192 and 512 icons, both 'any' and 'maskable', as PNG files of the right size", async () => {
    for (const size of [192, 512]) {
      for (const purpose of ["any", "maskable"]) {
        const icon = m.icons.find((i: any) => i.sizes === `${size}x${size}` && i.purpose === purpose);
        expect(icon, `${size} ${purpose}`).toBeTruthy();
        expect(existsSync(`public${icon.src}`)).toBe(true);
        const meta = await sharp(`public${icon.src}`).metadata();
        expect([meta.width, meta.height]).toEqual([size, size]);
      }
    }
  });
  it("has an Apple touch icon (180) and the iOS web-app meta in the layout", async () => {
    const meta = await sharp("public/icons/apple-touch-icon.png").metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([180, 180, false]); // iOS wants no transparency
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("apple-touch-icon.png");
    expect(layout).toMatch(/appleWebApp:\s*\{\s*capable: true/);
  });
});

describe("TWA verification file", () => {
  const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
  it("is an empty list until the package name and fingerprints are set", () => {
    expect(buildAssetLinks({})).toEqual([]);
    expect(buildAssetLinks({ TWA_PACKAGE_NAME: "in.calvy.business" })).toEqual([]);
    expect(buildAssetLinks({ TWA_SHA256_FINGERPRINTS: FP })).toEqual([]);
  });
  it("builds a valid assetlinks entry from the environment", () => {
    const out = buildAssetLinks({ TWA_PACKAGE_NAME: "in.calvy.business", TWA_SHA256_FINGERPRINTS: `${FP}, ${FP.toLowerCase()}` });
    expect(out).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "in.calvy.business", sha256_cert_fingerprints: [FP, FP] } }]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
  it("a malformed package name or fingerprint claims nothing", () => {
    expect(buildAssetLinks({ TWA_PACKAGE_NAME: "nopackage", TWA_SHA256_FINGERPRINTS: FP })).toEqual([]);
    expect(buildAssetLinks({ TWA_PACKAGE_NAME: "in.calvy.business", TWA_SHA256_FINGERPRINTS: "AA:BB" })).toEqual([]);
    expect(buildAssetLinks({ TWA_PACKAGE_NAME: "in.calvy.business", TWA_SHA256_FINGERPRINTS: `${FP},nonsense` })).toEqual([]);
  });
  it("the route serves JSON", async () => {
    const res = await assetlinksRoute();
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(Array.isArray(await res.json())).toBe(true);
    void NextRequest; void vi;
  });
});
