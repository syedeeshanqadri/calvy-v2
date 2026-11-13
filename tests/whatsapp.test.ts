import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  cfgFindUnique: vi.fn(), cfgFindMany: vi.fn(), cfgUpdate: vi.fn(), cfgCreate: vi.fn(),
  tplUpdateMany: vi.fn(), tplUpsert: vi.fn(),
  outFindFirst: vi.fn(), outUpdate: vi.fn(),
  optUpsert: vi.fn(), optFind: vi.fn(),
  notify: vi.fn(), alertTo: vi.fn(),
  access: vi.fn(), limits: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findUnique: db.cfgFindUnique, findMany: db.cfgFindMany, update: db.cfgUpdate, create: db.cfgCreate },
    whatsAppTemplate: { updateMany: db.tplUpdateMany, upsert: db.tplUpsert, findMany: async () => [] },
    notificationOutbox: { findFirst: db.outFindFirst, update: db.outUpdate },
    whatsAppOptOut: { upsert: db.optUpsert, findUnique: db.optFind },
  },
}));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: db.notify }));
vi.mock("@/lib/notifications/business", () => ({ alertRecipient: db.alertTo }));
vi.mock("@/lib/access", () => ({ accessSession: db.access }));
vi.mock("@/lib/getFeatures", () => ({ getBusinessFeatures: db.limits }));

import { encryptSecret } from "@/lib/notifications/secret";
import { isStopMessage, maskSecret, verifyMetaSignature } from "@/lib/whatsapp/signature";
import { GRAPH_VERSION, verifyConnection } from "@/lib/whatsapp/graph";
import { TEMPLATE_DEFS, buildTemplatePayload, languagesOf, templateName } from "@/lib/whatsapp/templates";
import { publicView, saveConfig } from "@/lib/whatsapp/store";
import { handleWebhook } from "@/lib/whatsapp/webhook";
import { runWhatsAppHealth } from "@/lib/whatsapp/health";
import { GET as webhookGET, POST as webhookPOST } from "@/app/api/whatsapp/webhook/[key]/route";
import { GET as settingsGET } from "@/app/api/settings/whatsapp/route";
import { whatsappCallbackUrl } from "@/lib/whatsapp/urls";
import { webhookBaseUrl, webhookUrlFor } from "@/lib/paymentUrls";
import { ForbiddenError } from "@/lib/permissions";

process.env.NEXTAUTH_SECRET = "test-secret";
const SECRET = "app-secret-123";
const TOKEN = "EAAG-super-secret-token-9999";
const sign = (body: string, s = SECRET) => `sha256=${createHmac("sha256", s).update(body).digest("hex")}`;
const cfgRow = (over: Record<string, unknown> = {}) => ({
  businessId: "b1", phoneNumberId: "111", wabaId: "222", accessTokenEnc: encryptSecret(TOKEN), appSecretEnc: encryptSecret(SECRET),
  webhookKey: "key1", verifyTokenEnc: encryptSecret("verify-me"), status: "CONNECTED", statusReason: null, displayPhone: "+1 555", verifiedName: "Shop",
  qualityRating: "GREEN", messagingTier: "TIER_1K", lastCheckedAt: null, errorNotifiedAt: null, ...over,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => { vi.clearAllMocks(); });

describe("encryption and masking", () => {
  it("masks to the last four characters", () => {
    expect(maskSecret(TOKEN)).toBe("••••••••9999");
    expect(maskSecret("short")).toBe("••••");
    expect(maskSecret(null)).toBeNull();
  });
  it("stores credentials encrypted, never plain", async () => {
    db.cfgFindUnique.mockResolvedValue(null);
    await saveConfig("b1", { phoneNumberId: "111", wabaId: "222", accessToken: TOKEN, appSecret: SECRET });
    const data = db.cfgCreate.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toContain(TOKEN);
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(data.webhookKey).toMatch(/^[A-Za-z0-9_-]{30,}$/);
  });
  it("requires token and secret on first save, keeps stored ones when blank later", async () => {
    db.cfgFindUnique.mockResolvedValue(null);
    expect((await saveConfig("b1", { phoneNumberId: "1", wabaId: "2" })).ok).toBe(false);
    db.cfgFindUnique.mockResolvedValue(cfgRow());
    await saveConfig("b1", { phoneNumberId: "1", wabaId: "2", accessToken: "", appSecret: "" });
    const data = db.cfgUpdate.mock.calls[0][0].data;
    expect(data.accessTokenEnc).toBeUndefined();
    expect(data.status).toBe("PENDING");
  });
  it("the browser view holds masked secrets only", () => {
    const view = publicView(cfgRow() as never);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(view?.callbackUrl).toContain("/api/whatsapp/webhook/key1");
  });
});

describe("signature verification", () => {
  it("accepts the right HMAC, rejects wrong, missing and malformed", () => {
    const body = '{"a":1}';
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyMetaSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(body + " ", sign(body), SECRET)).toBe(false);
  });
  it("webhook POST: 401 when unsigned or wrong, 200 when signed", async () => {
    db.cfgFindUnique.mockResolvedValue(cfgRow());
    const body = JSON.stringify({ entry: [] });
    const mk = (sig?: string) => new NextRequest("http://x/api/whatsapp/webhook/key1", { method: "POST", body, headers: sig ? { "x-hub-signature-256": sig } : {} });
    const ctx = { params: Promise.resolve({ key: "key1" }) };
    expect((await webhookPOST(mk(), ctx)).status).toBe(401);
    expect((await webhookPOST(mk(sign(body, "wrong")), ctx)).status).toBe(401);
    expect((await webhookPOST(mk(sign(body)), ctx)).status).toBe(200);
    db.cfgFindUnique.mockResolvedValue(null);
    expect((await webhookPOST(mk(sign(body)), ctx)).status).toBe(401);
  });
  it("webhook GET handshake echoes the challenge only with the right token", async () => {
    db.cfgFindUnique.mockResolvedValue(cfgRow());
    const ctx = { params: Promise.resolve({ key: "key1" }) };
    const url = (t: string) => new NextRequest(`http://x/api/whatsapp/webhook/key1?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=42`);
    const ok = await webhookGET(url("verify-me"), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    expect((await webhookGET(url("nope"), ctx)).status).toBe(403);
  });
});

describe("webhook events", () => {
  const msg = (body: string, from = "919876543210") => ({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, messages: [{ from, type: "text", text: { body } }] } }] }] });
  it("STOP / UNSUBSCRIBE records an opt-out for that business only", async () => {
    expect(isStopMessage(" Stop. ")).toBe(true);
    expect(isStopMessage("UNSUBSCRIBE")).toBe(true);
    expect(isStopMessage("don't stop by today")).toBe(false);
    const r = await handleWebhook("b1", "111", msg("STOP"));
    expect(r.optOuts).toBe(1);
    expect(db.optUpsert.mock.calls[0][0].create).toEqual({ businessId: "b1", phone: "+919876543210" });
    await handleWebhook("b1", "111", msg("thanks!"));
    expect(db.optUpsert).toHaveBeenCalledTimes(1);
  });
  it("ignores traffic for another phone number", async () => {
    const p = msg("STOP"); p.entry[0].changes[0].value.metadata.phone_number_id = "999";
    expect((await handleWebhook("b1", "111", p)).optOuts).toBe(0);
  });
  it("delivery status updates the log, never goes backwards, failed records the reason", async () => {
    const st = (status: string, errors?: { code?: number; title?: string }[]) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "111" }, statuses: [{ id: "wamid.1", status, errors }] } }] }] });
    db.outFindFirst.mockResolvedValue({ id: "o1", deliveryStatus: "delivered" });
    await handleWebhook("b1", "111", st("sent"));
    expect(db.outUpdate).not.toHaveBeenCalled();
    await handleWebhook("b1", "111", st("read"));
    expect(db.outUpdate.mock.calls[0][0].data.deliveryStatus).toBe("read");
    await handleWebhook("b1", "111", st("failed", [{ code: 131026, title: "Message undeliverable" }]));
    expect(db.outUpdate.mock.calls[1][0].data).toEqual({ deliveryStatus: "failed", deliveryError: "131026 Message undeliverable" });
    expect(db.outFindFirst.mock.calls[0][0].where.businessId).toBe("b1");
  });
  it("template status updates land on our template rows", async () => {
    db.tplUpdateMany.mockResolvedValue({ count: 1 });
    await handleWebhook("b1", "111", { entry: [{ changes: [{ field: "message_template_status_update", value: { event: "REJECTED", message_template_name: "calvy_booking_confirmed_v1", message_template_language: "en", reason: "INVALID_FORMAT" } }] }] });
    expect(db.tplUpdateMany.mock.calls[0][0].data).toEqual({ status: "REJECTED", reason: "INVALID_FORMAT" });
  });
  it("a category update (UTILITY -> MARKETING) is stored on the template row", async () => {
    db.tplUpdateMany.mockResolvedValue({ count: 1 });
    await handleWebhook("b1", "111", { entry: [{ changes: [{ field: "template_category_update", value: { message_template_name: "calvy_visit_thanks_v1", message_template_language: "en", new_category: "MARKETING" } }] }] });
    expect(db.tplUpdateMany.mock.calls[0][0]).toMatchObject({ where: { businessId: "b1", name: "calvy_visit_thanks_v1", language: "en" }, data: { category: "MARKETING" } });
  });
});

/**
 * Meta rejects a template with "too many variables for its length". Its threshold is not published, so we watch the ratio:
 * fixed words per variable, in the weaker of en and hi. Templates in WATCH are known to be low and are only FLAGGED (printed,
 * never failing) while Meta's verdict is awaited; anything else, including a watched template after a version bump, must
 * pass MIN_FIXED_WORDS_PER_VARIABLE. When Meta rejects one, lengthen it and bump its version (it leaves the list).
 */
const MIN_FIXED_WORDS_PER_VARIABLE = 4;
const WATCH = new Set([
  // the 4-variable templates sent to Meta as-is
  "booking_confirmed@2", "booking_reminder@2", "booking_rescheduled@2", "payment_received@1",
  // also under 4 when this check was added: awaiting Meta as well
  "booking_meeting_link@1", "staff_alert@1", "staff_new_booking@1",
]);
const ratio = (text: string) => {
  const vars = new Set(text.match(/\{\{\d+\}\}/g) ?? []).size;
  const words = text.replace(/\{\{\d+\}\}/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return words / Math.max(1, vars);
};
const weakest = (d: (typeof TEMPLATE_DEFS)[number]) => Math.min(...languagesOf(d).map((l) => ratio(d.body[l])));

describe("template length vs variables (Meta: 'too many variables for its length')", () => {
  const id = (d: (typeof TEMPLATE_DEFS)[number]) => `${d.key}@${d.version ?? 1}`;
  it("every new or changed template has enough fixed text per variable", () => {
    const bad = TEMPLATE_DEFS.filter((d) => !WATCH.has(id(d)) && weakest(d) < MIN_FIXED_WORDS_PER_VARIABLE).map((d) => `${id(d)} (${weakest(d).toFixed(2)} fixed words per variable)`);
    expect(bad, `lengthen these (min ${MIN_FIXED_WORDS_PER_VARIABLE}) or bump the version:`).toEqual([]);
  });
  it("FLAGS the watched templates so they stay visible (never fails)", () => {
    const flagged = TEMPLATE_DEFS.filter((d) => WATCH.has(id(d)));
    for (const d of flagged) console.warn(`[template watch] ${id(d)}: ${weakest(d).toFixed(2)} fixed words per variable (limit ${MIN_FIXED_WORDS_PER_VARIABLE}), awaiting Meta`);
    expect(flagged.length).toBeGreaterThan(0);
    expect([...WATCH].filter((w) => !TEMPLATE_DEFS.some((d) => id(d) === w)), "WATCH names a template or version that no longer exists").toEqual([]);
  });
  it("the three rewritten templates are well clear of the limit, with the new button text", () => {
    for (const k of ["token_issued", "token_moved_back", "booking_cancelled"]) expect(weakest(TEMPLATE_DEFS.find((d) => d.key === k)!)).toBeGreaterThanOrEqual(5);
    for (const k of ["token_issued", "token_moved_back"]) {
      const b = TEMPLATE_DEFS.find((d) => d.key === k)!.button!;
      expect(b.text).toEqual({ en: "Check token status", hi: "टोकन की स्थिति देखें" });
    }
    expect(TEMPLATE_DEFS.find((d) => d.key === "token_next")!.button!.text.en).toBe("Track my turn"); // unchanged until Meta's verdict
  });
});

const def_btn = (d: (typeof TEMPLATE_DEFS)[number], lang: "en" | "hi") => d.button?.text[lang].length ?? 0;

describe("Graph client and templates", () => {
  it("uses one pinned version constant and the business's own token", async () => {
    const f = vi.fn(async () => json({ display_phone_number: "+1 555", verified_name: "Shop", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K", id: "222" }));
    const out = await verifyConnection({ phoneNumberId: "111", wabaId: "222", accessToken: TOKEN }, f as never);
    expect(out.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/${GRAPH_VERSION}/111`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });
  it("401 / code 190 is an auth failure with a plain reason that never echoes the token", async () => {
    const f = vi.fn(async () => json({ error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, 401));
    const out = await verifyConnection({ phoneNumberId: "111", wabaId: "222", accessToken: TOKEN }, f as never);
    expect(out).toMatchObject({ ok: false, authFailure: true });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
  it("templates are UTILITY, en + hi, variables only, URL button with a dynamic suffix", () => {
    const names = new Set(TEMPLATE_DEFS.map((d) => templateName(d.key)));
    expect(names.size).toBe(TEMPLATE_DEFS.length);
    for (const d of TEMPLATE_DEFS) for (const lang of ["en", "hi"] as const) {
      const p = buildTemplatePayload(d, lang, { tracking: "https://calvy.io/shop/q/", dashboard: "https://calvy.io/dashboard/" });
      expect(p.category).toBe("UTILITY");
      expect(p.name).toMatch(/^calvy_[a-z_]+_v[123]$/);
      const body = d.body[lang];
      expect(body).not.toMatch(/@|https?:|\d{6,}/);
      // Meta rejects a body that starts or ends with a variable, or has two variables side by side.
      expect(body.trim()).not.toMatch(/^\{\{\d+\}\}|\{\{\d+\}\}[.!\s]*$/);
      expect(body).not.toMatch(/\}\}\s*\{\{/);
      expect(def_btn(d, lang)).toBeLessThanOrEqual(25);
      const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(new Set(vars).size).toBe(d.params.length);
    }
    const t = TEMPLATE_DEFS.find((d) => d.key === "token_issued")!;
    const btn = (buildTemplatePayload(t, "en", { tracking: "https://calvy.io/shop/q/", dashboard: "" }).components[1] as { buttons: { url: string }[] }).buttons[0];
    expect(btn.url).toBe("https://calvy.io/shop/q/{{1}}");
  });
});

describe("daily health check", () => {
  const bad = () => vi.fn(async () => json({ error: { code: 190, message: "revoked" } }, 401));
  beforeEach(() => {
    db.cfgFindMany.mockResolvedValue([{ businessId: "b1" }]);
    db.alertTo.mockResolvedValue("owner@example.test");
  });
  it("revoked token: ERROR, one email, and no second email on the next day", async () => {
    let row = cfgRow();
    db.cfgFindUnique.mockImplementation(async () => row);
    db.cfgUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } as never; return row; });
    await runWhatsAppHealth(new Date("2026-11-12T00:00:00Z"), bad() as never);
    expect(row.status).toBe("ERROR");
    expect(db.notify).toHaveBeenCalledTimes(1);
    await runWhatsAppHealth(new Date("2026-11-13T00:00:00Z"), bad() as never);
    expect(db.notify).toHaveBeenCalledTimes(1);
  });
  it("RED quality rating: ERROR and one email", async () => {
    let row = cfgRow();
    db.cfgFindUnique.mockImplementation(async () => row);
    db.cfgUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } as never; return row; });
    const f = vi.fn(async () => json({ display_phone_number: "+1", verified_name: "S", quality_rating: "RED", messaging_limit_tier: "TIER_1K", id: "1" }));
    await runWhatsAppHealth(new Date(), f as never);
    expect(row.status).toBe("ERROR");
    expect(db.notify).toHaveBeenCalledTimes(1);
  });
  it("a Meta outage (5xx) keeps CONNECTED and does not email the owner", async () => {
    let row = cfgRow();
    db.cfgFindUnique.mockImplementation(async () => row);
    db.cfgUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } as never; return row; });
    await runWhatsAppHealth(new Date(), vi.fn(async () => json({ error: { message: "oops" } }, 500)) as never);
    expect(row.status).toBe("CONNECTED");
    expect(row.lastCheckedAt).toBeInstanceOf(Date);
    expect(db.notify).not.toHaveBeenCalled();
  });
  it("a deleted/invalid phone number (400) is a real failure: ERROR and one email", async () => {
    let row = cfgRow();
    db.cfgFindUnique.mockImplementation(async () => row);
    db.cfgUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } as never; return row; });
    await runWhatsAppHealth(new Date(), vi.fn(async () => json({ error: { code: 100, message: "Unsupported get request" } }, 400)) as never);
    expect(row.status).toBe("ERROR");
    expect(db.notify).toHaveBeenCalledTimes(1);
  });
  it("recovery: a later good check returns to CONNECTED and re-arms the one-email rule", async () => {
    let row = cfgRow({ status: "ERROR", errorNotifiedAt: new Date() });
    db.cfgFindUnique.mockImplementation(async () => row);
    db.cfgUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } as never; return row; });
    await runWhatsAppHealth(new Date(), vi.fn(async () => json({ display_phone_number: "+1", verified_name: "S", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K", id: "1" })) as never);
    expect(row.status).toBe("CONNECTED");
    expect(row.errorNotifiedAt).toBeNull();
  });
});

describe("owner-only and plan gate", () => {
  it("a team member is refused (accessSession('owner') -> 403)", async () => {
    db.access.mockRejectedValue(new ForbiddenError());
    expect((await settingsGET()).status).toBe(403);
    expect(db.access).toHaveBeenCalledWith("owner");
  });
  it("free plan gets 403 UPGRADE_REQUIRED", async () => {
    db.access.mockResolvedValue({ user: { businessId: "b1" } });
    db.limits.mockResolvedValue({ whatsappReminders: false });
    const res = await settingsGET();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UPGRADE_REQUIRED");
  });
});

describe("webhook base URL on previews", () => {
  const base = { NEXT_PUBLIC_APP_URL: "https://calvy.io", VERCEL_AUTOMATION_BYPASS_SECRET: "BYP" };
  it("preview uses the stable branch alias for WhatsApp and Cashfree, falling back to VERCEL_URL", () => {
    const env = { ...base, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "calvy-v2-git-x-q3labs.vercel.app", VERCEL_URL: "calvy-v2-abc123.vercel.app" };
    expect(whatsappCallbackUrl("K", env)).toBe("https://calvy-v2-git-x-q3labs.vercel.app/api/whatsapp/webhook/K?x-vercel-protection-bypass=BYP");
    expect(webhookUrlFor(env)).toBe("https://calvy-v2-git-x-q3labs.vercel.app/api/payments/cashfree/webhook?x-vercel-protection-bypass=BYP");
    const noAlias = { ...env, VERCEL_BRANCH_URL: undefined };
    expect(webhookBaseUrl(noAlias)).toBe("https://calvy-v2-abc123.vercel.app");
  });
  it("production is unchanged: configured app URL, no bypass", () => {
    const env = { ...base, VERCEL_ENV: "production", VERCEL_BRANCH_URL: "alias.vercel.app", VERCEL_URL: "dep.vercel.app" };
    expect(whatsappCallbackUrl("K", env)).toBe("https://calvy.io/api/whatsapp/webhook/K");
    expect(webhookUrlFor(env)).toBe("https://calvy.io/api/payments/cashfree/webhook");
  });
});
