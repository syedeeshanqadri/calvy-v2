// PWA layout audit (Step 19, A). Plain Playwright script, not part of `npm test` or CI.
//   npx dotenv -e .env.local -- node scripts/pwa-audit.mjs <persona>      persona: clinic | salon | member | public
// Env: AUDIT_OUT (output dir, required), AUDIT_PHASE (before|after), BASE_URL, TEST_PASSWORD (from the env, never printed),
//      AUDIT_VIEWPORTS (comma list of viewport ids to restrict), AUDIT_ROUTES (comma list of routes), AUDIT_DIALOGS=0 to skip dialogs.
// Dashboard personas run in emulated standalone display mode. Public pages run as a normal mobile browser (layout checks only).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.TEST_PASSWORD || "CalvyDev#2026";
const OUT = process.env.AUDIT_OUT;
const PHASE = process.env.AUDIT_PHASE ?? "before";
const PERSONA = process.argv[2];
if (!OUT || !PERSONA) { console.error("usage: AUDIT_OUT=dir node scripts/pwa-audit.mjs clinic|salon|member|public"); process.exit(1); }
fs.mkdirSync(path.join(OUT, PHASE), { recursive: true });
const RESULTS = path.join(OUT, PHASE, `${PERSONA}.ndjson`);
fs.writeFileSync(RESULTS, "");

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const AND = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
// kb = on-screen keyboard height [portrait, landscape]
const DEVICES = [
  { id: "iphone-se", w: 375, h: 667, dsf: 2, ua: IOS, kb: [291, 200] },
  { id: "iphone-15", w: 393, h: 852, dsf: 3, ua: IOS, kb: [336, 200] },
  { id: "iphone-15-pro-max", w: 430, h: 932, dsf: 3, ua: IOS, kb: [336, 200] },
  { id: "pixel-7", w: 412, h: 915, dsf: 2.6, ua: AND, kb: [300, 190] },
  { id: "galaxy-s23", w: 360, h: 780, dsf: 3, ua: AND, kb: [290, 190] },
  { id: "android-small", w: 360, h: 640, dsf: 2, ua: AND, kb: [270, 180] },
  { id: "ipad", w: 768, h: 1024, dsf: 2, ua: IPAD, kb: [313, 400], tablet: true },
];
const VIEWPORTS = DEVICES.flatMap((d) => [
  { ...d, id: `${d.id}-p`, width: d.w, height: d.h, kbh: d.kb[0] },
  { ...d, id: `${d.id}-l`, width: d.h, height: d.w, kbh: d.kb[1] },
]);
const DIALOG_VPS = new Set(["iphone-se-p", "android-small-p", "iphone-15-l", "ipad-p", "pixel-7-p"]);
const MEMBER_VPS = new Set(["iphone-se-p", "android-small-p", "iphone-15-l", "ipad-p"]);
const only = (process.env.AUDIT_VIEWPORTS ?? "").split(",").filter(Boolean);

const DASH_ROUTES = [
  "/dashboard", "/dashboard/queue", "/dashboard/calendar", "/dashboard/appointments", "/dashboard/clients",
  "/dashboard/staff", "/dashboard/services", "/dashboard/settings", "/dashboard/settings/team",
  "/dashboard/settings/notifications", "/dashboard/settings/notifications/log", "/dashboard/settings/activity",
  "/dashboard/settings/whatsapp", "/dashboard/settings/whatsapp/guide", "/dashboard/alerts", "/dashboard/website",
  "/dashboard/analytics", "/dashboard/booking-page", "/dashboard/broadcasts", "/dashboard/expenses", "/dashboard/payments",
  "/dashboard/wallet", "/dashboard/billing", "/dashboard/support",
];
const routesOverride = (process.env.AUDIT_ROUTES ?? "").split(",").filter(Boolean);

const PERSONAS = {
  clinic: { email: "clinic@calvy.test", password: PASSWORD, slug: "city-care-clinic" },
  salon: { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD || "password123", slug: "alex-johnson-studio" },
  member: { email: "audit-receptionist@example.com", password: "Receptionist-pass-1", slug: "city-care-clinic" },
};

const STANDALONE = `(() => {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => { const r = mm(q); if (/display-mode:\\s*standalone/.test(q)) return new Proxy(r, { get: (t, k) => (k === "matches" ? true : typeof t[k] === "function" ? t[k].bind(t) : t[k]) }); return r; };
  try { Object.defineProperty(navigator, "standalone", { value: true }); } catch {}
})();`;

// ---- runs inside the page ---------------------------------------------------------------------------------------------
function inPage(opts) {
  const vw = innerWidth, vh = innerHeight;
  const issues = [];
  const add = (type, detail) => issues.push({ type, detail });
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05; };
  const dev = (el) => !!el.closest("nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]");
  const sel = (el) => {
    const t = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter((c) => c && !/[:\[\]/]/.test(c)).slice(0, 2).map((c) => `.${c}`).join("") : "";
    const txt = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${t}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };

  // The modal in front, if any: [role=dialog] or a near full-screen fixed overlay (its biggest child is the panel).
  const findModal = () => {
    const d = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible).pop();
    let overlay = d;
    if (!overlay) {
      overlay = [...document.querySelectorAll("body *")].filter((el) => {
        if (dev(el) || !visible(el)) return false;
        const s = getComputedStyle(el); if (s.position !== "fixed") return false;
        const r = el.getBoundingClientRect(); return r.width >= vw * 0.9 && r.height >= vh * 0.9;
      }).pop();
    }
    if (!overlay) return null;
    const hasContent = (c) => !c.getAttribute("aria-hidden") && (c.querySelector("input,textarea,select,button,a[href]") || (c.innerText || "").trim().length > 3);
    const kids = [...overlay.querySelectorAll(":scope > *")].filter((c) => visible(c) && hasContent(c)).map((c) => ({ c, a: c.getBoundingClientRect().width * c.getBoundingClientRect().height })).sort((x, y) => y.a - x.a);
    const panel = d && !overlay.querySelector('[role="dialog"]') ? d : kids[0] && kids[0].a > vw * vh * 0.05 ? kids[0].c : overlay;
    return panel;
  };

  const scopeEl = opts.dialog ? findModal() : document.body;
  if (opts.dialog && !scopeEl) return { issues: [], modal: false };
  if (opts.kb) {
    // keyboard check: focus the first text field of the modal, report where its primary action is
    const input = [...scopeEl.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea")].find((e) => visible(e));
    if (input) input.focus();
    const acts = [...scopeEl.querySelectorAll("button,[role=button]")].filter((b) => visible(b) && (b.type === "submit" || /^(save|add|create|confirm|book|send|submit|done|invite|update|apply|continue|next|schedule|record|import)/i.test((b.innerText || "").trim())));
    const b = acts[acts.length - 1];
    const r = b ? b.getBoundingClientRect() : null;
    return { issues: [], kb: { hasInput: !!input, found: !!b, label: b ? (b.innerText || "").trim().slice(0, 24) : null, bottom: r ? Math.round(r.bottom) : null, top: r ? Math.round(r.top) : null, vh } };
  }
  const within = (el) => scopeEl === document.body || scopeEl.contains(el);

  // fixed bars (header at the top, nav at the bottom)
  const bars = [...document.querySelectorAll("body *")].filter((el) => {
    if (dev(el) || !visible(el)) return false;
    const s = getComputedStyle(el); if (s.position !== "fixed" && s.position !== "sticky") return false;
    const r = el.getBoundingClientRect();
    return r.height < vh * 0.4 && r.width > vw * 0.5 && (r.top <= 1 || r.bottom >= vh - 1);
  });

  // 1. horizontal overflow of the page
  if (opts.page) {
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) {
      const offenders = [...document.querySelectorAll("body *")].filter((el) => {
        if (dev(el) || !visible(el)) return false;
        const r = el.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return false; }
        return true;
      }).slice(0, 4).map((el) => `${sel(el)} (right ${Math.round(el.getBoundingClientRect().right)} > ${vw})`);
      add("h-overflow", `page scrollWidth ${de.scrollWidth} > ${de.clientWidth}${offenders.length ? "; " + offenders.join("; ") : ""}`);
    }
  }

  const hiddenControl = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== "auto" && /rect\(0/.test(s.clip)) || /inset\(50%\)/.test(s.clipPath || ""); }; // sr-only toggles, skip links
  const interactive = [...(scopeEl === document.body ? document : scopeEl).querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role="button"],[role="tab"],summary')].filter((el) => !dev(el) && visible(el) && !hiddenControl(el));

  // 2. controls covered by a fixed bar (what is on screen right now)
  if (opts.page && bars.length) {
    const covered = [];
    for (const el of interactive) {
      if (bars.some((b) => b.contains(el))) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      const bar = bars.find((b) => b.contains(top));
      if (bar) covered.push(`${sel(el)} under ${sel(bar)}`);
    }
    if (covered.length) add("covered-by-bar", `${covered.length}: ${covered.slice(0, 3).join("; ")}`);
  }

  // 2b. layout: the lowest visible content must clear the bottom bar when scrolled to the end; the bottom nav must not exist from 768px up
  if (opts.page && opts.bottom) {
    const bottomBar = bars.find((b) => b.getBoundingClientRect().bottom >= vh - 1);
    if (bottomBar) {
      const navTop = bottomBar.getBoundingClientRect().top;
      const lows = [...document.querySelectorAll("body *")].filter((el) => !dev(el) && visible(el) && !bars.some((b) => b.contains(el)) && !hiddenControl(el) && !el.closest("[aria-hidden=true]") && el.children.length === 0 && !/^(SCRIPT|STYLE|PATH|SVG)$/i.test(el.tagName));
      let lowest = null, lowestBottom = -1;
      for (const el of lows) { const r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > lowestBottom && r.bottom <= vh + 400) { lowest = el; lowestBottom = r.bottom; } }
      if (lowest && lowestBottom > navTop + 1 && lowestBottom <= vh) add("last-content-under-bar", `${sel(lowest)} bottom ${Math.round(lowestBottom)} > bar top ${Math.round(navTop)}`);
    }
  }
  if (opts.page && vw >= 768) {
    const nav = bars.find((b) => b.tagName === "NAV" && b.getBoundingClientRect().bottom >= vh - 1);
    if (nav) add("bottom-nav-at-768+", `${vw}px wide still shows the bottom nav (${sel(nav)})`);
  }

  // 3. tap targets < 44px
  const small = interactive.filter((el) => {
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) { for (const lab of [el.closest("label"), ...(el.labels ? [...el.labels] : [])]) { if (!lab) continue; const lr = lab.getBoundingClientRect(); if (lr.width >= 44 && lr.height >= 44) return false; } }
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) return false;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") { const p = el.parentElement; if (p && p.innerText && p.innerText.trim().length > (el.innerText || "").trim().length + 8) return false; }
    return !(el.tagName === "INPUT" && el.type === "file");
  });
  if (small.length) add("tap-target<44", `${small.length}: ${small.slice(0, 4).map((el) => `${sel(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`).join("; ")}`);

  // 4. text clipped / overflowing
  const clipped = [...(scopeEl === document.body ? document.body : scopeEl).querySelectorAll("*")].filter((el) => {
    if (dev(el) || !visible(el) || !within(el)) return false;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) return false;
    const s = getComputedStyle(el);
    if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp) return false;
    const hx = (s.overflowX === "hidden" || s.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2;
    const hy = (s.overflowY === "hidden" || s.overflowY === "clip") && el.scrollHeight > el.clientHeight + 3 && s.display !== "inline";
    const r = el.getBoundingClientRect();
    const off = r.right > vw + 2 && !el.closest('[style*="overflow"],[class*="overflow-x"]');
    return hx || hy || off;
  });
  if (clipped.length) add("text-clipped", `${clipped.length}: ${clipped.slice(0, 3).map(sel).join("; ")}`);

  // 5. inputs under 16px (iOS zooms the page on focus)
  const small16 = interactive.filter((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|file|button|submit|color|image/.test(el.type || "") && parseFloat(getComputedStyle(el).fontSize) < 16);
  if (small16.length) add("input-font<16", `${small16.length}: ${small16.slice(0, 3).map((el) => `${sel(el)} ${getComputedStyle(el).fontSize}`).join("; ")}`);

  // 6. modal checks
  let modalInfo = null;
  if (opts.dialog) {
    const r = scopeEl.getBoundingClientRect();
    modalInfo = { h: Math.round(r.height), vh, top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), vw };
    if (r.height > vh + 1) add("modal-taller-than-viewport", `panel ${Math.round(r.height)}px > viewport ${vh}px`);
    if (r.bottom > vh + 1 || r.top < -1) add("modal-off-screen", `panel top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, viewport ${vh}`);
    if (vw <= 600 && (r.width < vw - 2 || r.height < vh - 2)) add("modal-not-full-screen-on-phone", `panel ${Math.round(r.width)}x${Math.round(r.height)} in ${vw}x${vh}`);
    const act = [...scopeEl.querySelectorAll("button,[role=button]")].filter((b) => visible(b) && (b.type === "submit" || /^(save|add|create|confirm|book|send|submit|done|invite|update|apply|continue|next|schedule|record|import)/i.test((b.innerText || "").trim())));
    const off = act.filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > vh + 1 || br.top < -1; });
    if (off.length) add("primary-action-not-visible", `${off.map((b) => `${sel(b)} bottom ${Math.round(b.getBoundingClientRect().bottom)} > ${vh}`).slice(0, 2).join("; ")} (needs scroll, not sticky)`);
    const sticky = act.some((b) => { for (let p = b; p && p !== scopeEl.parentElement; p = p.parentElement) if (/sticky|fixed/.test(getComputedStyle(p).position)) return true; return false; });
    modalInfo.stickyAction = sticky; modalInfo.actions = act.length;
  }
  return { issues, modal: modalInfo, bars: bars.map(sel) };
}

// ---- helpers ------------------------------------------------------------------------------------------------------------
const slug = (s) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
const log = (rec) => fs.appendFileSync(RESULTS, JSON.stringify(rec) + "\n");

async function shot(page, vp, route, state) {
  const dir = path.join(OUT, PHASE, "shots", PERSONA, vp.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(route)}${state ? `__${slug(state)}` : ""}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 55 }).catch(() => {});
  return path.relative(OUT, file);
}

async function scrollTo(page, bottom) {
  await page.evaluate((b) => {
    const cands = [document.scrollingElement, ...document.querySelectorAll("main, [class*=overflow-y-auto], [class*=overflow-auto]")].filter(Boolean);
    for (const el of cands) { if (el.scrollHeight > el.clientHeight + 4) el.scrollTop = b ? el.scrollHeight : 0; }
    window.scrollTo(0, b ? document.documentElement.scrollHeight : 0);
  }, bottom);
  await page.waitForTimeout(150);
}

async function goto(page, url) {
  const res = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((e) => ({ err: String(e).slice(0, 100) }));
  await page.waitForLoadState("networkidle", { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(350);
  return res;
}

async function checkPage(page, vp, route, state, { dialog = false, pageChecks = true } = {}) {
  const merged = [];
  let modal = null;
  const passes = dialog ? [false] : [false, true];
  for (const bottom of passes) {
    if (!dialog) await scrollTo(page, bottom);
    const r = await page.evaluate(inPage, { dialog, page: pageChecks, bottom }).catch((e) => ({ issues: [{ type: "audit-error", detail: String(e).slice(0, 120) }] }));
    if (r.modal === false) return null;
    if (r.modal) modal = r.modal;
    for (const i of r.issues) if (!merged.some((m) => m.type === i.type && m.detail === i.detail)) merged.push({ ...i, at: bottom ? "scrolled-bottom" : "top" });
  }
  if (!dialog) await scrollTo(page, false);
  const file = await shot(page, vp, route, state);
  const rec = { phase: PHASE, persona: PERSONA, vp: vp.id, route, state: state ?? "page", url: new URL(page.url()).pathname, issues: merged, modal, shot: file };
  log(rec);
  return rec;
}

async function triggers(page) {
  return page.evaluate(() => {
    const re = /^(\+\s*)?(add|new|create|invite|edit|walk-?in|book|schedule|record|import)\b/i;
    const bad = /delete|remove|cancel|send|export|complete|refund|pay|withdraw|activate|upgrade|sign out|log ?out/i;
    const seen = new Set();
    return [...document.querySelectorAll("button, [role=button]")].filter((b) => {
      const r = b.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
      const t = (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
      if (!t || t.length > 40 || !re.test(t) || bad.test(t) || seen.has(t)) return false;
      seen.add(t); return true;
    }).slice(0, 4).map((b) => (b.innerText || b.getAttribute("aria-label")).trim().replace(/\s+/g, " "));
  });
}

async function closeModal(page, route) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  if (await page.evaluate(() => !!document.querySelector('[role="dialog"],[aria-modal="true"]')).catch(() => false)) {
    await page.getByRole("button", { name: /^(close|cancel|back|×|x)$/i }).first().click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  if (new URL(page.url()).pathname !== route) await goto(page, route);
}

async function keyboardCheck(page, vp, route, state) {
  await page.setViewportSize({ width: vp.width, height: Math.max(200, vp.height - vp.kbh) });
  await page.waitForTimeout(350);
  const r = await page.evaluate(inPage, { dialog: true, kb: true }).catch(() => ({}));
  const k = r.kb;
  if (k && k.hasInput) {
    const issues = [];
    if (k.found && (k.bottom > k.vh + 1 || k.top < 0)) issues.push({ type: "keyboard-hides-primary-action", detail: `"${k.label}" bottom ${k.bottom} > visible ${k.vh}px (keyboard ${vp.kbh}px)`, at: "keyboard-open" });
    if (!k.found) issues.push({ type: "keyboard-no-visible-primary-action", detail: "no save/confirm button in the dialog", at: "keyboard-open" });
    const file = await shot(page, vp, route, `${state}-keyboard`);
    log({ phase: PHASE, persona: PERSONA, vp: vp.id, route, state: `${state}-keyboard`, url: new URL(page.url()).pathname, issues, modal: null, shot: file });
  }
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(150);
}

async function interactions(page, vp, route) {
  const names = await triggers(page);
  for (const name of names) {
    const btn = page.getByRole("button", { name, exact: true }).first();
    await btn.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(600);
    const rec = await checkPage(page, vp, route, `dialog ${name}`, { dialog: true });
    if (rec) await keyboardCheck(page, vp, route, `dialog ${name}`);
    await closeModal(page, route);
  }
  // first booking-like row -> booking detail
  if (/appointments|calendar|queue|^\/dashboard$/.test(route)) {
    const clicked = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      const el = [...main.querySelectorAll("tr, li, [role=button], button, a")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 80 && r.height > 20 && /\d{1,2}:\d{2}|#\d+/.test(e.innerText || "") && !/delete|cancel/i.test(e.innerText || ""); });
      if (!el) return false; el.setAttribute("data-audit-row", "1"); return true;
    });
    if (clicked) {
      await page.locator("[data-audit-row]").first().click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      const inDialog = await checkPage(page, vp, route, "booking-detail", { dialog: true });
      if (inDialog) await keyboardCheck(page, vp, route, "booking-detail");
      else if (new URL(page.url()).pathname !== route) await shot(page, vp, route, "booking-detail-page");
      await closeModal(page, route);
    }
  }
}

async function moreSheet(page, vp, route) {
  const more = page.getByRole("button", { name: /^more$/i }).or(page.getByRole("link", { name: /^more$/i })).first();
  if (!(await more.isVisible().catch(() => false))) return;
  await more.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
  await checkPage(page, vp, route, "more-sheet", { dialog: true });
  await closeModal(page, route);
}

async function login(ctx, email, password, loginPath = "/login") {
  const page = await ctx.newPage();
  await page.goto(BASE + loginPath, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/\/dashboard|\/my/, { timeout: 90_000 });
  await page.close();
}

async function ensureMember(browser) {
  const stateFile = path.join(OUT, "member.state.json");
  const ctx = await browser.newContext({ baseURL: BASE });
  try {
    await login(ctx, PERSONAS.member.email, PERSONAS.member.password);
    await ctx.storageState({ path: stateFile });
    await ctx.close();
    return stateFile;
  } catch { /* not created yet */ }
  await login(ctx, PERSONAS.clinic.email, PASSWORD);
  const res = await ctx.request.post(BASE + "/api/team", { data: { name: "Audit Receptionist", email: PERSONAS.member.email, roleName: "Receptionist", permissions: ["appointments.view_all", "appointments.write", "customers.view", "customers.edit"], staffId: null } });
  if (res.status() !== 201) throw new Error(`team invite failed: ${res.status()} ${(await res.text()).slice(0, 120)}`);
  const { devToken } = await res.json();
  if (!devToken) throw new Error("server needs AUTH_TEST_RETURN_TOKEN=1 to return the invite token");
  const acc = await ctx.request.post(BASE + "/api/team/accept", { data: { token: devToken, password: PERSONAS.member.password } });
  if (!acc.ok()) throw new Error(`accept failed: ${acc.status()}`);
  await ctx.close();
  const c2 = await browser.newContext({ baseURL: BASE });
  await login(c2, PERSONAS.member.email, PERSONAS.member.password);
  await c2.storageState({ path: stateFile });
  await c2.close();
  return stateFile;
}

function ctxOptions(vp, extra = {}) {
  return { viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf, userAgent: vp.ua, isMobile: true, hasTouch: true, baseURL: BASE, ...extra };
}

// ---- personas -------------------------------------------------------------------------------------------------------------
async function runDashboard(browser, persona) {
  const p = PERSONAS[persona];
  let storage;
  if (persona === "member") storage = await ensureMember(browser);
  else {
    const c = await browser.newContext({ baseURL: BASE });
    await login(c, p.email, p.password);
    storage = path.join(OUT, `${persona}.state.json`);
    await c.storageState({ path: storage });
    await c.close();
  }
  const vps = VIEWPORTS.filter((v) => (!only.length || only.includes(v.id)) && (persona !== "member" || MEMBER_VPS.has(v.id)));
  for (const vp of vps) {
    const ctx = await browser.newContext(ctxOptions(vp, { storageState: storage }));
    await ctx.addInitScript(STANDALONE);
    const page = await ctx.newPage();
    let routes = routesOverride.length ? routesOverride : [...DASH_ROUTES];
    // one client detail page, found from the clients list
    if (!routesOverride.length) {
      await goto(page, "/dashboard/clients");
      const href = await page.evaluate(() => [...document.querySelectorAll('a[href^="/dashboard/clients/"]')].map((a) => a.getAttribute("href")).find((h) => /clients\/[^/]+$/.test(h)) ?? null);
      if (href) routes.push(href);
    }
    for (const route of routes) {
      try {
        const res = await goto(page, route);
        const rec = await checkPage(page, vp, route, null);
        if (rec && rec.url !== route.split("?")[0]) rec.note = `redirected to ${rec.url}`;
        if (rec && rec.url === route) {
          if (route === "/dashboard") await moreSheet(page, vp, route);
          if (DIALOG_VPS.has(vp.id) && process.env.AUDIT_DIALOGS !== "0") await interactions(page, vp, route);
        }
        if (res && res.err) log({ phase: PHASE, persona, vp: vp.id, route, state: "error", issues: [{ type: "load-error", detail: res.err }] });
      } catch (e) {
        log({ phase: PHASE, persona, vp: vp.id, route, state: "error", issues: [{ type: "audit-error", detail: String(e).slice(0, 160) }] });
      }
    }
    // install prompt in a normal browser tab (not standalone): how many install UIs are shown, and do they sit above the bottom nav?
    if (persona === "clinic") await installPromptCheck(browser, vp, storage);
    await ctx.close();
    console.log(`[${persona}] ${vp.id} done`);
  }
}

async function installPromptCheck(browser, vp, storage) {
  const ctx = await browser.newContext(ctxOptions(vp, { storageState: storage }));
  const page = await ctx.newPage();
  await goto(page, "/dashboard");
  await page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(e); });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const vh = innerHeight, vw = innerWidth;
    const nav = [...document.querySelectorAll("nav, [class*=bottom]")].filter((el) => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().bottom >= vh - 1 && el.getBoundingClientRect().height < vh * 0.3).map((el) => el.getBoundingClientRect())[0];
    const ui = [...document.querySelectorAll("body *")].filter((el) => {
      if (el.closest("nextjs-portal")) return false;
      const r = el.getBoundingClientRect(); if (r.width < 120 || r.height < 30 || r.height > vh * 0.6) return false;
      const own = el.innerText || ""; if (!/install/i.test(own) || own.length > 260) return false;
      const kids = [...el.children].some((c) => /install/i.test(c.innerText || "") && (c.innerText || "").length > 8 && c.getBoundingClientRect().width > 120 && (c.innerText || "").length <= 260 && c.getBoundingClientRect().height > 30);
      return !kids;
    }).map((el) => { const r = el.getBoundingClientRect(); return { text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60), top: Math.round(r.top), bottom: Math.round(r.bottom), pos: getComputedStyle(el).position }; });
    return { ui, nav: nav ? { top: Math.round(nav.top) } : null, vh };
  });
  const issues = [];
  if (r.ui.length > 1) issues.push({ type: "multiple-install-prompts", detail: `${r.ui.length}: ${r.ui.map((u) => `"${u.text}" (${u.pos} ${u.top}-${u.bottom})`).join(" | ")}` });
  if (r.nav) for (const u of r.ui) if (u.bottom > r.nav.top + 1 && u.top < r.vh) issues.push({ type: "install-prompt-overlaps-bottom-nav", detail: `"${u.text}" ${u.top}-${u.bottom} vs nav top ${r.nav.top}` });
  const file = await shot(page, vp, "/dashboard", "install-prompt");
  log({ phase: PHASE, persona: "clinic", vp: vp.id, route: "/dashboard", state: "install-prompt", url: "/dashboard", issues, modal: null, shot: file, note: `${r.ui.length} install UI(s) visible` });
  // leakage: same tab, now on a public page: manifest link, SW control, install UI
  if (vp.id === "iphone-15-p") {
    await page.waitForTimeout(1500);
    await goto(page, "/city-care-clinic");
    await page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = async () => {}; window.dispatchEvent(e); });
    await page.waitForTimeout(1200);
    const leak = await page.evaluate(async () => ({
      manifest: [...document.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute("href")),
      swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      swScopes: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [],
      installText: [...document.querySelectorAll("body *")].filter((e) => !e.closest("nextjs-portal") && /install (calvy|app)|add to home screen/i.test(e.innerText || "") && (e.innerText || "").length < 200 && e.getBoundingClientRect().height > 20).length,
    }));
    const li = [];
    if (leak.manifest.length) li.push({ type: "public-page-has-manifest", detail: leak.manifest.join(",") });
    if (leak.swController) li.push({ type: "public-page-controlled-by-service-worker", detail: `scopes ${leak.swScopes.join(",")}` });
    if (leak.installText) li.push({ type: "public-page-shows-install-prompt", detail: `${leak.installText} element(s)` });
    log({ phase: PHASE, persona: "clinic", vp: vp.id, route: "/city-care-clinic", state: "pwa-leak-check", url: "/city-care-clinic", issues: li, modal: null, note: JSON.stringify(leak) });
  }
  await ctx.close();
}

async function runPublic(browser) {
  const vps = VIEWPORTS.filter((v) => !only.length || only.includes(v.id));
  for (const vp of vps) {
    const ctx = await browser.newContext(ctxOptions(vp)); // normal browser tab: no standalone emulation
    const page = await ctx.newPage();
    const routes = routesOverride.length ? routesOverride : [
      "/city-care-clinic", "/b/city-care-clinic", "/city-care-clinic/book-now",
      "/alex-johnson-studio", "/b/alex-johnson-studio", "/alex-johnson-studio/book-now",
      "/my/login", "/my/signup", "/booking/return?order_id=audit", "/booking/success",
    ];
    for (const route of routes) {
      try {
        await goto(page, route);
        const rec = await checkPage(page, vp, route, null);
        if (DIALOG_VPS.has(vp.id) && rec && /book-now|\/b\//.test(route)) await keyboardPublic(page, vp, route);
      } catch (e) { log({ phase: PHASE, persona: "public", vp: vp.id, route, state: "error", issues: [{ type: "audit-error", detail: String(e).slice(0, 160) }] }); }
    }
    await ctx.close();
    console.log(`[public] ${vp.id} done`);
  }
}

// Booking flow with the keyboard open: first visible text field on the page (details step is reached only when a slot is chosen).
async function keyboardPublic(page, vp, route) {
  const ok = await page.evaluate(() => { const i = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea")].find((e) => e.getBoundingClientRect().width > 0); if (i) { i.focus(); return true; } return false; });
  if (!ok) return;
  await page.setViewportSize({ width: vp.width, height: Math.max(200, vp.height - vp.kbh) });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().width > 0 && /continue|confirm|book|next|submit/i.test(x.innerText || "")).pop();
    if (!b) return null; const rect = b.getBoundingClientRect(); return { label: b.innerText.trim().slice(0, 24), bottom: Math.round(rect.bottom), vh: innerHeight, sticky: (() => { for (let p = b; p; p = p.parentElement) if (/sticky|fixed/.test(getComputedStyle(p).position)) return true; return false; })() };
  });
  const issues = [];
  if (r && r.bottom > r.vh + 1 && !r.sticky) issues.push({ type: "keyboard-hides-primary-action", detail: `"${r.label}" bottom ${r.bottom} > visible ${r.vh}px (keyboard ${vp.kbh}px), not sticky`, at: "keyboard-open" });
  const file = await shot(page, vp, route, "keyboard");
  log({ phase: PHASE, persona: "public", vp: vp.id, route, state: "keyboard", url: new URL(page.url()).pathname, issues, modal: null, shot: file });
  await page.setViewportSize({ width: vp.width, height: vp.height });
}

const browser = await chromium.launch();
try {
  if (PERSONA === "public") await runPublic(browser);
  else if (PERSONAS[PERSONA]) await runDashboard(browser, PERSONA);
  else throw new Error(`unknown persona ${PERSONA}`);
} finally {
  await browser.close();
}
console.log(`[${PERSONA}] finished -> ${RESULTS}`);
