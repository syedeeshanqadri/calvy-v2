import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const db = vi.hoisted(() => ({
  cfgFindUnique: vi.fn(), cfgFindFirst: vi.fn(), cfgUpsert: vi.fn(), cfgUpdate: vi.fn(), cfgDeleteMany: vi.fn(),
  tplDeleteMany: vi.fn(), evCreate: vi.fn(), evDeleteMany: vi.fn(),
  verifyAndStore: vi.fn(), installTemplates: vi.fn(), handleWebhook: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findUnique: db.cfgFindUnique, findFirst: db.cfgFindFirst, upsert: db.cfgUpsert, update: db.cfgUpdate, deleteMany: db.cfgDeleteMany },
    whatsAppTemplate: { deleteMany: db.tplDeleteMany },
    whatsAppWebhookEvent: { create: db.evCreate, deleteMany: db.evDeleteMany },
  },
}));
vi.mock("@/lib/whatsapp/store", async () => ({ ...(await vi.importActual<object>("@/lib/whatsapp/store")), verifyAndStore: db.verifyAndStore, installTemplates: db.installTemplates }));
vi.mock("@/lib/whatsapp/webhook", () => ({ handleWebhook: db.handleWebhook }));

import { NextRequest } from "next/server";
import { encryptSecret, decryptSecret } from "@/lib/notifications/secret";
import { connectEmbedded, disconnectEmbedded, finishWithPin, metaEnv } from "@/lib/whatsapp/embedded";
import { loginOptions, parseSessionMessage } from "@/lib/whatsapp/embeddedSession";
import { handleCalvyWebhook } from "@/lib/whatsapp/calvyWebhook";
import { GET, POST } from "@/app/api/whatsapp/webhook/route";
import { POST as PER_BUSINESS_POST } from "@/app/api/whatsapp/webhook/[key]/route";

process.env.NEXTAUTH_SECRET = "test-secret";
const env = { appId: "APP", appSecret: "APP_SECRET", configId: "CFG", verifyToken: "vt" };
const bases = { tracking: "https://calvy.io/s/q/", dashboard: "https://calvy.io/dashboard/" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const row = (over: Record<string, unknown> = {}) => ({ businessId: "b1", source: "EMBEDDED", status: "CONNECTED", statusReason: null, phoneNumberId: "111", wabaId: "222", accessTokenEnc: encryptSecret("BUSINESS_TOKEN"), ...over });

/** A fake Graph API keyed by "METHOD path"; records every call. */
function graphFake(routes: Record<string, () => Response>) {
  const calls: { method: string; url: string; auth: string | null; body: string }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    calls.push({ method, url: u.pathname + u.search, auth: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") });
    const key = Object.keys(routes).find((k) => k === `${method} ${u.pathname.replace(/^\/v[\d.]+\//, "")}`);
    return key ? routes[key]() : json({ error: { message: `unmocked ${method} ${u.pathname}` } }, 404);
  });
  return { f: f as unknown as typeof fetch, calls };
}
const happy = { "GET oauth/access_token": () => json({ access_token: "BUSINESS_TOKEN" }), "POST 222/subscribed_apps": () => json({ success: true }) };

beforeEach(() => {
  vi.resetAllMocks();
  db.cfgFindUnique.mockResolvedValue(null);
  db.cfgUpsert.mockResolvedValue({}); db.cfgUpdate.mockResolvedValue({}); db.cfgDeleteMany.mockResolvedValue({}); db.tplDeleteMany.mockResolvedValue({});
  db.verifyAndStore.mockResolvedValue({ ok: true, authFailure: false, transient: false, reason: null });
  db.installTemplates.mockResolvedValue({ ok: true, failures: [] });
  db.handleWebhook.mockResolvedValue({});
  db.evCreate.mockResolvedValue({}); db.evDeleteMany.mockResolvedValue({});
});
/** First lookup (is there a connection already?) finds nothing; after the upsert the row is there and CONNECTED. */
const freshThenConnected = () => db.cfgFindUnique.mockResolvedValueOnce(null).mockResolvedValue(row());

describe("Embedded Signup session message (browser side)", () => {
  const msg = (event: string, data: object) => JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data });
  it("believes only Facebook origins", () => {
    expect(parseSessionMessage("https://evil.example", msg("FINISH", { waba_id: "100000000000222", phone_number_id: "100000000000111" }))).toBeNull();
    expect(parseSessionMessage("https://www.facebook.com", msg("FINISH", { waba_id: "100000000000222", phone_number_id: "100000000000111" }))).toEqual({ kind: "finish", wabaId: "100000000000222", phoneNumberId: "100000000000111", coexistence: false });
  });
  it("reads the coexistence finish, cancel and error events", () => {
    expect(parseSessionMessage("https://web.facebook.com", msg("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", { waba_id: "100000000000222", phone_number_id: "100000000000111" }))).toMatchObject({ kind: "finish", coexistence: true });
    expect(parseSessionMessage("https://www.facebook.com", msg("CANCEL", { current_step: "PHONE_NUMBER_SETUP" }))).toEqual({ kind: "cancel", step: "PHONE_NUMBER_SETUP" });
    expect(parseSessionMessage("https://www.facebook.com", msg("CANCEL", { error_message: "Something broke", error_id: "1" }))).toEqual({ kind: "error", message: "Something broke" });
    expect(parseSessionMessage("https://www.facebook.com", "not json")).toBeNull();
    expect(parseSessionMessage("https://www.facebook.com", JSON.stringify({ type: "OTHER" }))).toBeNull();
  });
  it("FB.login options: coexistence adds the business-app featureType, a new number does not", () => {
    expect(loginOptions("CFG", true)).toMatchObject({ config_id: "CFG", response_type: "code", extras: { sessionInfoVersion: "3", featureType: "whatsapp_business_app_onboarding" } });
    expect((loginOptions("CFG", false).extras as Record<string, unknown>).featureType).toBeUndefined();
  });
});

describe("connectEmbedded", () => {
  it("new number: exchanges the code, subscribes, registers with a generated PIN, stores token and PIN encrypted, installs templates", async () => {
    freshThenConnected();
    const g = graphFake({ ...happy, "GET 111": () => json({ status: "PENDING", is_pin_enabled: false }), "GET 222": () => json({}), "POST 111/register": () => json({ success: true }) });
    const r = await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: false }, bases, env, g.f);
    expect(r).toEqual({ ok: true, failures: [] });
    // Code exchange uses the Calvy app id + secret server-side.
    expect(g.calls[0].url).toContain("client_secret=APP_SECRET");
    expect(g.calls.find((c) => c.url.includes("subscribed_apps"))?.method).toBe("POST");
    const reg = g.calls.find((c) => c.url.includes("/register"))!;
    const pin = JSON.parse(reg.body).pin as string;
    expect(pin).toMatch(/^\d{6}$/);
    expect(reg.auth).toBe("Bearer BUSINESS_TOKEN");
    const upsert = db.cfgUpsert.mock.calls[0][0].create;
    expect(upsert.accessTokenEnc).not.toContain("BUSINESS_TOKEN");
    expect(decryptSecret(upsert.accessTokenEnc)).toBe("BUSINESS_TOKEN");
    const stored = db.cfgUpdate.mock.calls.map((c) => c[0].data).find((d) => d.pinEnc)!;
    expect(stored.pinEnc).not.toContain(pin);
    expect(decryptSecret(stored.pinEnc)).toBe(pin);
    expect(db.installTemplates).toHaveBeenCalledOnce();
  });

  it("two-step verification already set: asks for the PIN instead of failing, registers nothing", async () => {
    const g = graphFake({ ...happy, "GET 111": () => json({ status: "PENDING", is_pin_enabled: true }) });
    const r = await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: false }, bases, env, g.f);
    expect(r).toEqual({ ok: false, needPin: true, wrongPin: false });
    expect(g.calls.some((c) => c.url.includes("/register"))).toBe(false);
    expect(db.installTemplates).not.toHaveBeenCalled();
  });

  it("finishWithPin: right PIN registers and finishes; wrong PIN asks again; the PIN never appears in logs", async () => {
    const spy = vi.spyOn(console, "log"), spyW = vi.spyOn(console, "warn"), spyE = vi.spyOn(console, "error");
    db.cfgFindUnique.mockResolvedValue(row({ status: "PENDING" }));
    const wrong = graphFake({ "POST 111/register": () => json({ error: { code: 133005, message: "Two step verification PIN Mismatch" } }, 400) });
    expect(await finishWithPin("b1", "123456", bases, wrong.f)).toEqual({ ok: false, needPin: true, wrongPin: true });
    db.cfgFindUnique.mockResolvedValueOnce(row({ status: "PENDING" })).mockResolvedValue(row());
    const right = graphFake({ "POST 111/register": () => json({ success: true }), "GET 111": () => json({ name_status: "APPROVED" }), "GET 222": () => json({ primary_funding_id: "9" }) });
    expect(await finishWithPin("b1", "654321", bases, right.f)).toEqual({ ok: true, failures: [] });
    expect(JSON.parse(right.calls[0].body).pin).toBe("654321");
    for (const s of [spy, spyW, spyE]) expect(JSON.stringify(s.mock.calls)).not.toMatch(/123456|654321/);
    spy.mockRestore(); spyW.mockRestore(); spyE.mockRestore();
  });

  it("coexistence: never registers the number (it is already registered in the WhatsApp Business app)", async () => {
    freshThenConnected();
    const g = graphFake({ ...happy, "GET 222": () => json({}) });
    const r = await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: true }, bases, env, g.f);
    expect(r.ok).toBe(true);
    expect(g.calls.some((c) => c.url.includes("/register"))).toBe(false);
    expect(db.cfgUpsert.mock.calls[0][0].create.coexistence).toBe(true);
  });

  it("refuses to overwrite a manual connection (disconnect first)", async () => {
    db.cfgFindUnique.mockResolvedValueOnce({ source: "MANUAL" });
    const g = graphFake(happy);
    const r = await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: false }, bases, env, g.f);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Disconnect it first") });
    expect(g.f).not.toHaveBeenCalled();
  });

  it("a rejected code exchange or failed subscribe returns a readable error and installs nothing", async () => {
    const bad = graphFake({ "GET oauth/access_token": () => json({ error: { message: "Invalid verification code" } }, 400) });
    expect(await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: false }, bases, env, bad.f)).toMatchObject({ ok: false, error: "Invalid verification code" });
    const noSub = graphFake({ "GET oauth/access_token": () => json({ access_token: "T" }), "POST 222/subscribed_apps": () => json({ error: { message: "nope" } }, 400) });
    expect(await connectEmbedded("b1", { code: "CODE12345", wabaId: "222", phoneNumberId: "111", coexistence: false }, bases, env, noSub.f)).toMatchObject({ ok: false });
    expect(db.installTemplates).not.toHaveBeenCalled();
  });
});

describe("disconnectEmbedded", () => {
  it("unsubscribes the app, then deletes the stored tokens", async () => {
    db.cfgFindUnique.mockResolvedValue(row());
    const g = graphFake({ "DELETE 222/subscribed_apps": () => json({ success: true }) });
    expect(await disconnectEmbedded("b1", g.f)).toEqual({ unsubscribed: true });
    expect(g.calls[0]).toMatchObject({ method: "DELETE", auth: "Bearer BUSINESS_TOKEN" });
    expect(db.cfgDeleteMany).toHaveBeenCalledWith({ where: { businessId: "b1" } });
  });
  it("still deletes locally when Meta cannot be reached", async () => {
    db.cfgFindUnique.mockResolvedValue(row());
    const g = graphFake({ "DELETE 222/subscribed_apps": () => json({ error: { message: "down" } }, 500) });
    expect(await disconnectEmbedded("b1", g.f)).toEqual({ unsubscribed: false });
    expect(db.cfgDeleteMany).toHaveBeenCalled();
  });
});

describe("Calvy-level webhook route", () => {
  const SECRET = "APP_SECRET";
  const body = JSON.stringify({ entry: [{ id: "222", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "calvy_x_v1", message_template_language: "en" } }] }] });
  const sign = (raw: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const post = (raw: string, sig: string | null) => new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: sig ? { "x-hub-signature-256": sig } : {} });
  beforeEach(() => { process.env.META_APP_SECRET = SECRET; process.env.META_APP_ID = "A"; process.env.META_ES_CONFIG_ID = "C"; process.env.META_WEBHOOK_VERIFY_TOKEN = "vt"; });

  it("GET handshake needs the verify token", async () => {
    const ok = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42"));
    expect(ok.status).toBe(200); expect(await ok.text()).toBe("42");
    expect((await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42"))).status).toBe(403);
  });
  it("rejects a missing or wrong signature, computed over the raw body", async () => {
    expect((await POST(post(body, null))).status).toBe(401);
    expect((await POST(post(body, sign(body, "other")))).status).toBe(401);
    // Same JSON, different bytes (extra whitespace): a signature of the re-serialised body must NOT pass.
    expect((await POST(post(`${body} `, sign(body)))).status).toBe(401);
    expect(db.handleWebhook).not.toHaveBeenCalled();
    db.cfgFindFirst.mockResolvedValue({ businessId: "b1", phoneNumberId: "111" });
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    expect(db.handleWebhook).toHaveBeenCalledOnce();
  });
  it("routes by WABA id to the business and calls the shared handler", async () => {
    db.cfgFindFirst.mockResolvedValue({ businessId: "b7", phoneNumberId: "555" });
    await POST(post(body, sign(body)));
    expect(db.cfgFindFirst.mock.calls[0][0].where).toMatchObject({ wabaId: "222", source: "EMBEDDED" });
    expect(db.handleWebhook.mock.calls[0].slice(0, 2)).toEqual(["b7", "555"]);
  });
  it("unknown phone_number_id / waba_id: logged and answered 200, nothing handled", async () => {
    db.cfgFindFirst.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const msg = JSON.stringify({ entry: [{ id: "999", changes: [{ field: "messages", value: { metadata: { phone_number_id: "404" }, statuses: [{ id: "w1", status: "sent" }] } }] }] });
    const res = await POST(post(msg, sign(msg)));
    expect(res.status).toBe(200);
    expect(db.handleWebhook).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("is idempotent per event: a retried delivery is applied once", async () => {
    db.cfgFindFirst.mockResolvedValue({ businessId: "b1", phoneNumberId: "111" });
    const seen = new Set<string>();
    db.evCreate.mockImplementation(async ({ data }: { data: { key: string } }) => { if (seen.has(data.key)) throw Object.assign(new Error("dup"), { code: "P2002" }); seen.add(data.key); });
    const payload = { entry: [{ id: "222", changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, statuses: [{ id: "wamid.1", status: "delivered" }, { id: "wamid.2", status: "read" }] } }] }] };
    const a = await handleCalvyWebhook(payload);
    const b = await handleCalvyWebhook(payload);
    expect(a.events).toBe(1); expect(b.duplicates).toBe(2); expect(b.events).toBe(0);
    expect(db.handleWebhook).toHaveBeenCalledTimes(1);
    expect(db.handleWebhook.mock.calls[0][2].entry[0].changes[0].value.statuses).toHaveLength(2);
  });
  it("template_category_update reaches the shared handler (the send gate relies on it)", async () => {
    db.cfgFindFirst.mockResolvedValue({ businessId: "b1", phoneNumberId: "111" });
    const p = { entry: [{ id: "222", time: 1, changes: [{ field: "template_category_update", value: { message_template_name: "calvy_x_v1", new_category: "MARKETING" } }] }] };
    await handleCalvyWebhook(p);
    expect(db.handleWebhook.mock.calls[0][2].entry[0].changes[0]).toMatchObject({ field: "template_category_update", value: { new_category: "MARKETING" } });
  });
  it("the per-business (manual) webhook never accepts an embedded row", async () => {
    db.cfgFindUnique.mockResolvedValue({ businessId: "b1", phoneNumberId: "111", appSecretEnc: encryptSecret("x"), source: "EMBEDDED" });
    const raw = "{}";
    const req = new NextRequest("http://x/api/whatsapp/webhook/k", { method: "POST", body: raw, headers: { "x-hub-signature-256": sign(raw, "x") } });
    expect((await PER_BUSINESS_POST(req, { params: Promise.resolve({ key: "k" }) })).status).toBe(401);
  });
});

describe("metaEnv", () => {
  it("is null until the app id, secret and configuration id are all set", () => {
    expect(metaEnv({ META_APP_ID: "a", META_APP_SECRET: "s" })).toBeNull();
    expect(metaEnv({ META_APP_ID: "a", META_APP_SECRET: "s", META_ES_CONFIG_ID: "c", META_WEBHOOK_VERIFY_TOKEN: "v" })).toEqual({ appId: "a", appSecret: "s", configId: "c", verifyToken: "v" });
  });
});
