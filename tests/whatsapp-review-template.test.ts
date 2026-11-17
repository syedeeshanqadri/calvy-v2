import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ cfgFindUnique: vi.fn(), audit: vi.fn(), gate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppConfig: { findUnique: db.cfgFindUnique } } }));
vi.mock("@/lib/admin/auth", () => ({ requireAdminApi: db.gate }));
vi.mock("@/lib/admin/audit", () => ({ adminAudit: db.audit }));

import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/notifications/secret";
import { REVIEW_TEMPLATE_NAME, createReviewTemplate, reviewTemplatePayload } from "@/lib/whatsapp/reviewTemplate";
import { POST } from "@/app/api/admin/whatsapp-review/route";

process.env.NEXTAUTH_SECRET = "test-secret";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const cfg = (over: Record<string, unknown> = {}) => ({ businessId: "biz12345", status: "CONNECTED", phoneNumberId: "111", wabaId: "222", accessTokenEnc: encryptSecret("TOKEN"), ...over });
const post = (body: unknown) => new NextRequest("http://x/api/admin/whatsapp-review", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => { vi.resetAllMocks(); db.cfgFindUnique.mockResolvedValue(cfg()); db.audit.mockResolvedValue("a1"); });

describe("App Review demo template", () => {
  it("is a UTILITY template named calvy_app_review_demo with a sample for every variable", () => {
    const p = reviewTemplatePayload();
    expect(p).toMatchObject({ name: "calvy_app_review_demo", category: "UTILITY", language: "en" });
    const body = p.components[0] as { text: string; example: { body_text: string[][] } };
    expect(body.example.body_text[0]).toHaveLength((body.text.match(/\{\{\d\}\}/g) ?? []).length);
  });
  it("creates it on the connected WABA and returns Meta's id and status", async () => {
    const f = vi.fn(async () => json({ id: "9001", status: "PENDING", category: "UTILITY" }));
    const r = await createReviewTemplate("biz12345", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: "9001", status: "PENDING", name: REVIEW_TEMPLATE_NAME, alreadyExisted: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/222/message_templates");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer TOKEN");
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "calvy_app_review_demo", category: "UTILITY" });
  });
  it("when it already exists, shows Meta's current id and status instead of an error", async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => init?.method === "POST"
      ? json({ error: { code: 2388024, message: "Content in this language already exists" } }, 400)
      : json({ data: [{ id: "77", name: "calvy_app_review_demo", language: "en", status: "APPROVED", category: "UTILITY" }] }));
    expect(await createReviewTemplate("biz12345", f as unknown as typeof fetch)).toEqual({ ok: true, id: "77", status: "APPROVED", name: REVIEW_TEMPLATE_NAME, alreadyExisted: true });
  });
  it("shows Meta's message when it refuses, and refuses a business that is not connected", async () => {
    const f = vi.fn(async () => json({ error: { code: 100, message: "Invalid parameter" } }, 400));
    expect(await createReviewTemplate("biz12345", f as unknown as typeof fetch)).toEqual({ ok: false, error: "Invalid parameter" });
    db.cfgFindUnique.mockResolvedValue(cfg({ status: "ERROR" }));
    expect(await createReviewTemplate("biz12345", f as unknown as typeof fetch)).toMatchObject({ ok: false });
    db.cfgFindUnique.mockResolvedValue(null);
    expect(await createReviewTemplate("biz12345", f as unknown as typeof fetch)).toMatchObject({ ok: false, error: expect.stringContaining("no WhatsApp") });
  });
  it("the route is super-admin only: no admin session, no call to Meta, no audit row", async () => {
    db.gate.mockResolvedValue({ ok: false, res: NextResponse.json({ error: "Not found" }, { status: 404 }) });
    expect((await POST(post({ businessId: "biz12345" }))).status).toBe(404);
    expect(db.cfgFindUnique).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });
  it("an admin's use is written to the audit log", async () => {
    db.gate.mockResolvedValue({ ok: true, ctx: { user: { id: "u1", email: "a@b.c" } } });
    db.cfgFindUnique.mockResolvedValue(null);
    const res = await POST(post({ businessId: "biz12345" }));
    expect(res.status).toBe(400);
    expect(db.audit).toHaveBeenCalledWith(expect.anything(), { id: "u1", email: "a@b.c" }, expect.objectContaining({ action: "whatsapp.review_template", businessId: "biz12345" }));
  });
});
