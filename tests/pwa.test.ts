import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import vm from "vm";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { buildAssetLinks } from "@/lib/assetlinks";
import { GET as assetlinksRoute } from "@/app/.well-known/assetlinks.json/route";

// The installable business app: manifest, icons, the service worker's cache rules, the offline page and the TWA verification file.

type Listener = (e: any) => void;

const SW_FILE = "public/app-sw.js";

/** Run public/app-sw.js in a sandbox with a fake cache store, and return handles to drive it. */
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
  vm.runInContext(readFileSync(SW_FILE, "utf8"), ctx);

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
    const src = readFileSync(SW_FILE, "utf8");
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
    expect([...sw.store.keys()]).toEqual(["calvy-app-v1"]);
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
    const sw = loadSw({ caches: { "calvy-v2": { "/dashboard": "x" }, "calvy-app-v1": { "/offline.html": "ok" } } });
    await sw.fire("activate", sw.waitEvent());
    expect([...sw.store.keys()]).toEqual(["calvy-app-v1"]);
    expect(sw.calls.claim).toBe(1);
  });
});
async function caches_has(sw: ReturnType<typeof loadSw>, name: string) { return sw.store.has(name); }

describe("service worker: push", () => {
  it("shows the alert and opens only a path inside the app", async () => {
    const sw = loadSw();
    await sw.fire("push", sw.waitEvent({ data: { json: () => ({ title: "New booking", body: "Riya K. · Haircut · 3:30 pm", url: "/dashboard/appointments", tag: "t1" }) } }));
    expect(sw.calls.shown[0]).toMatchObject({ title: "New booking", options: { body: "Riya K. · Haircut · 3:30 pm", data: { url: "/dashboard/appointments" } } });
    expect(sw.calls.shown[0].options.tag).toMatch(/^t1:\d+$/); // unique per event: never silently replaces an earlier alert
    await sw.fire("push", sw.waitEvent({ data: { json: () => ({ title: "x", body: "y", url: "https://evil.example/phish" }) } }));
    expect(sw.calls.shown[1].options.data.url).toBe("/dashboard");
    await sw.fire("push", sw.waitEvent({ data: { json: () => ({ title: "x", body: "y", url: "/my/bookings" }) } }));
    expect(sw.calls.shown[2].options.data.url).toBe("/dashboard"); // an alert can only open the business app
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
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("apple-touch-icon.png");
    expect(readFileSync("lib/appMetadata.ts", "utf8")).toMatch(/appleWebApp:\s*\{\s*capable: true/);
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

describe("the app is isolated from public and customer pages", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  const appFiles = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.(tsx?|mjs)$/.test(f));

  it("the manifest is linked ONLY by the app routes: dashboard, login, accept-invite", () => {
    const linking = appFiles.filter((f) => /appManifestMetadata|manifest\.json/.test(readFileSync(f, "utf8")) && f !== "lib/appMetadata.ts");
    expect(linking.sort()).toEqual(["app/accept-invite/layout.tsx", "app/dashboard/layout.tsx", "app/login/layout.tsx"]);
    expect(readFileSync("app/layout.tsx", "utf8")).not.toMatch(/manifest|appleWebApp|InstallPrompt/);
  });
  it("there is exactly ONE install prompt component and only the dashboard layout mounts it", () => {
    expect(existsSync("components/PWAInstallPrompt.tsx")).toBe(false);
    const mounting = appFiles.filter((f) => /<InstallPrompt\s*\/>/.test(readFileSync(f, "utf8")));
    expect(mounting).toEqual(["components/dashboard/DashboardLayout.tsx"]);
  });
  it("the worker is registered at /app-sw.js with scope /dashboard, never at the root", () => {
    const pwa = readFileSync("lib/pwa.ts", "utf8");
    expect(pwa).toContain('APP_SW_URL = "/app-sw.js"');
    expect(pwa).toContain('APP_SW_SCOPE = "/dashboard"');
    for (const f of appFiles) expect(readFileSync(f, "utf8"), f).not.toMatch(/register\(\s*"\/sw\.js"|scope:\s*"\/"/);
  });
  it("the manifest keeps scope / and starts at /dashboard", () => {
    expect(JSON.parse(readFileSync("public/manifest.json", "utf8"))).toMatchObject({ scope: "/", start_url: "/dashboard" });
  });
});

describe("the retired root worker (public/sw.js) removes itself", () => {
  function run() {
    const listeners: Record<string, Listener[]> = {};
    const log = { deleted: [] as string[], unregistered: 0, skipped: 0 };
    const self: any = { addEventListener: (t: string, fn: Listener) => { (listeners[t] ??= []).push(fn); }, skipWaiting: () => { log.skipped++; }, registration: { unregister: async () => { log.unregistered++; return true; } } };
    vm.runInContext(readFileSync("public/sw.js", "utf8"), vm.createContext({ self, caches: { keys: async () => ["calvy-v2", "calvy-static-v3"], delete: async (n: string) => { log.deleted.push(n); return true; } } }));
    return { listeners, log };
  }
  it("takes over at once, deletes every cache, unregisters, and never answers a request", async () => {
    const { listeners, log } = run();
    expect(Object.keys(listeners).sort()).toEqual(["activate", "install"]); // no fetch / push handler
    listeners.install[0]({});
    const waits: Promise<unknown>[] = [];
    listeners.activate[0]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(log).toEqual({ deleted: ["calvy-v2", "calvy-static-v3"], unregistered: 1, skipped: 1 });
  });
});

describe("removeLegacyWorkers (the dashboard cleans up the old root registration)", () => {
  it("unregisters scope '/' (and reports its push subscription), leaves the /dashboard worker alone", async () => {
    const { removeLegacyWorkers } = await import("@/lib/pwa");
    const unreg = { root: 0, dash: 0 };
    const fetched: { url: string; method?: string; body?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { fetched.push({ url, method: init?.method, body: init?.body as string }); return new Response("{}"); });
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: async () => [
      { scope: "https://app.example/", unregister: async () => { unreg.root++; }, pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/old" }) } },
      { scope: "https://app.example/dashboard", unregister: async () => { unreg.dash++; }, pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/new" }) } },
    ] } });
    expect(await removeLegacyWorkers()).toEqual({ hadPush: true });
    expect(unreg).toEqual({ root: 1, dash: 0 });
    expect(fetched).toEqual([{ url: "/api/push/subscribe", method: "DELETE", body: JSON.stringify({ endpoint: "https://push.example/old" }) }]);
    vi.unstubAllGlobals();
  });
  it("no legacy registration: nothing happens", async () => {
    const { removeLegacyWorkers } = await import("@/lib/pwa");
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: async () => [] } });
    expect(await removeLegacyWorkers()).toEqual({ hadPush: false });
    vi.unstubAllGlobals();
  });
});

describe("layout: sidebar from 768px (tablets and phones in landscape), bottom nav below", () => {
  it("the sidebar, bottom nav and header switch at md (768px), not lg (1024px)", () => {
    for (const f of ["components/dashboard/DashboardLayout.tsx", "components/dashboard/BottomNav.tsx", "components/dashboard/Header.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\blg:(hidden|flex|block|pb-6)\b/);
    }
    expect(readFileSync("components/dashboard/DashboardLayout.tsx", "utf8")).toMatch(/hidden md:flex flex-col/);
    expect(readFileSync("components/dashboard/BottomNav.tsx", "utf8")).toMatch(/<nav className="[^"]*md:hidden/);
  });
  it("the manifest allows any orientation", () => {
    expect(JSON.parse(readFileSync("public/manifest.json", "utf8")).orientation).toBe("any");
  });
});

describe("touch devices: 16px inputs and 44px targets, everywhere", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.indexOf("@media (pointer: coarse)"));
  it("a global rule makes every text input, select and textarea 16px (iOS never zooms) and 44px tall", () => {
    expect(block).toMatch(/select,\s*textarea \{ font-size: 16px !important; \}/);
    expect(block).toMatch(/min-height: 44px/);
    expect(block).toMatch(/button:not\(\.tap-tight\)[^}]*min-height: 44px; min-width: 44px/);
  });
  it("covers the public pages and /my too: the rule is global (root CSS), not dashboard-only", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toContain('import "./globals.css"');
  });
  it("the website theme's small buttons and the booking back link keep a 44px target; social icons are 44px", () => {
    expect(readFileSync("app/[slug]/site.css", "utf8")).toMatch(/pointer: coarse\) \{ \.st-btn, \.st-btn-sm \{ min-height: 44px/);
    expect(readFileSync("app/[slug]/booking.css", "utf8")).toMatch(/\.bk-back \{ min-width: 44px/);
    expect(readFileSync("components/site/Brand.tsx", "utf8")).toContain("w-11 h-11 rounded-full");
  });
});

describe("notifications log and booking pages on phones", () => {
  it("the log renders one card per message on phones and the table only from md up (no sideways scrolling)", () => {
    const src = readFileSync("components/notifications/LogTable.tsx", "utf8");
    expect(src).toMatch(/<ul className="md:hidden[^"]*" data-testid="log-cards">/);
    expect(src).toMatch(/<div className="hidden md:block overflow-x-auto">/);
  });
  it("the sticky Continue bar never hides the last option: scroll margin, and not sticky on short screens", () => {
    const css = readFileSync("app/[slug]/booking.css", "utf8");
    expect(css).toMatch(/\.bk-opt[^{]*\{ scroll-margin-bottom: 120px; \}/);
    expect(css).toMatch(/@media \(max-height: 520px\) \{ \.bk-step \{ padding-bottom: 0; \} \.bk-nav \{ position: static/);
  });

  it("step-20: phones keep room (bar height + safe area) under the last option; the bar is a plain row from 768px", () => {
    const css = readFileSync("app/[slug]/booking.css", "utf8");
    expect(css).toMatch(/@media \(max-width: 767px\) \{ \.bk-step \{ padding-bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
    expect(css).toMatch(/@media \(min-width: 768px\) \{ \.bk-nav \{ position: static/);
    expect(readFileSync("app/[slug]/site.css", "utf8")).toMatch(/@media \(min-width: 768px\) \{ \.st-bar \{ display: none; \} \}/);
  });

  it("step-20: the shared Modal ignores sibling margins (space-y parents) and Phone alerts explains the iPhone sound", () => {
    expect(readFileSync("components/ui/Modal.tsx", "utf8")).toContain('className="!m-0 fixed');
    expect(readFileSync("components/dashboard/SoundSettings.tsx", "utf8")).toContain("iPhone plays its default notification sound when locked; keep Calvy open for the loud chime.");
  });
});

describe("dialogs: full-screen sheets on phones with actions above the keyboard", () => {
  const modal = readFileSync("components/ui/Modal.tsx", "utf8");
  it("the shared Modal is a role=dialog sheet that follows the visual viewport (keyboard), centered card from md", () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("visualViewport");
    expect(modal).toContain("--vvh");
    expect(modal).toMatch(/h-\[var\(--vvh,100dvh\)\]/);
    expect(modal).toMatch(/md:max-h-\[90vh\] md:rounded-2xl/);
  });
  it("has a pinned footer for actions and scrolls the focused field into view", () => {
    expect(modal).toMatch(/footer\?: React\.ReactNode/);
    expect(modal).toContain("flex-shrink-0 border-t");
    expect(modal).toContain("scrollIntoView");
  });
  it("legacy inline action rows inside a form are pinned on phones too", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.sheet-body form > :last-child:has\(button\[type="submit"\]\)/);
    expect(css).toMatch(/position: sticky; bottom: 0/);
  });
  it("the support and expense dialogs use the shared Modal (no hand-rolled overlay)", () => {
    for (const f of ["app/dashboard/support/SupportClient.tsx", "app/dashboard/expenses/ExpensesClient.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain('from "@/components/ui/Modal"');
    }
    expect(readFileSync("app/dashboard/expenses/ExpensesClient.tsx", "utf8")).not.toContain("fixed inset-0 z-50 flex items-end sm:items-center");
  });
});

describe("a member opening a page they cannot use", () => {
  it("lands on a clear 'no access' screen (with a way back), not the member home", () => {
    const page = readFileSync("app/dashboard/no-access/page.tsx", "utf8");
    expect(page).toContain("You don&apos;t have access to this page");
    expect(page).toContain('href="/dashboard"');
    expect(page).toMatch(/redirect\("\/login"\)/); // signed-out visitors still go to login
    expect(readFileSync("lib/access.ts", "utf8")).toContain('redirect("/dashboard/no-access")');
  });
});

describe("accessibility basics the Lighthouse run flagged", () => {
  it("readableTextOn picks the text colour with enough contrast on any staff colour", async () => {
    const { readableTextOn } = await import("@/lib/utils");
    expect(readableTextOn("#0369a1")).toBe("#ffffff"); // brand blue
    expect(readableTextOn("#22c55e")).toBe("#0f0f1a"); // light green: white would be 2.3:1
    expect(readableTextOn("#0ea5e9")).toBe("#0f0f1a");
    expect(readableTextOn("#ef4444")).toBe("#0f0f1a" === readableTextOn("#ef4444") ? "#0f0f1a" : "#ffffff"); // either, but always one of the two
    expect(["#ffffff", "#0f0f1a"]).toContain(readableTextOn("not-a-colour"));
  });
  it("the accent blue is AA against white, icon-only buttons have names, inactive nav labels are readable", () => {
    expect(readFileSync("tailwind.config.ts", "utf8")).toMatch(/DEFAULT: "#0369a1"/);
    expect(readFileSync("components/dashboard/MiniCalendar.tsx", "utf8")).toContain('aria-label="Previous month"');
    expect(readFileSync("components/dashboard/BottomNav.tsx", "utf8")).toContain('aria-label="Close menu"');
    expect(readFileSync("components/dashboard/BottomNav.tsx", "utf8")).not.toContain("#b0b0c0");
  });
});

describe("every dialog's action row is pinned on phones", () => {
  it("the Cancel / Save rows inside Modal bodies carry .sheet-actions", () => {
    const files: [string, number][] = [
      ["components/dashboard/AppointmentModals.tsx", 1], ["app/dashboard/clients/ClientsClient.tsx", 1], ["app/dashboard/settings/team/TeamClient.tsx", 1],
      ["app/dashboard/staff/StaffClient.tsx", 1], ["app/dashboard/services/ServicesClient.tsx", 2], ["components/dashboard/QuickActions.tsx", 1], ["components/my/BookingCard.tsx", 1],
    ];
    for (const [f, min] of files) expect((readFileSync(f, "utf8").match(/className="sheet-actions /g) ?? []).length, f).toBeGreaterThanOrEqual(min);
  });
});

describe("pinned dialog actions at every screen size", () => {
  it("the sticky rule is not tied to a breakpoint: phones, landscape phones and tablet cards all keep the action row in view", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = css.slice(css.indexOf(".sheet-body { --sheet-pad"));
    expect(rule).toContain("@media (min-width: 768px) { .sheet-body { --sheet-pad: 1.5rem; } }");
    expect(rule).toMatch(/\.sheet-body form > :last-child:has\(button\[type="submit"\]\),\s*\.sheet-body \.sheet-actions \{\s*position: sticky; bottom: 0;/);
    expect(rule).toContain("margin: 0.75rem calc(var(--sheet-pad) * -1) 0");
  });
});

describe("the bottom nav never covers the end of a page", () => {
  it("the nav clearance also applies from 640px (sm:p-6 would otherwise shrink it to 24px on a phone in landscape) and ends at the sidebar breakpoint", () => {
    expect(readFileSync("components/dashboard/DashboardLayout.tsx", "utf8")).toContain("p-4 sm:p-6 pb-mobile-nav sm:pb-mobile-nav md:pb-6");
  });
});
