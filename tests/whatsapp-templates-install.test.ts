import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  cfgFindUnique: vi.fn(), cfgUpdate: vi.fn(),
  tplUpsert: vi.fn(), tplUpdateMany: vi.fn(), tplFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findUnique: db.cfgFindUnique, update: db.cfgUpdate },
    whatsAppTemplate: { upsert: db.tplUpsert, updateMany: db.tplUpdateMany, findMany: db.tplFindMany },
  },
}));

import { encryptSecret } from "@/lib/notifications/secret";
import { installTemplates, listCurrentTemplates } from "@/lib/whatsapp/store";
import { TEMPLATE_DEFS, TEMPLATE_LANGUAGES, currentTemplateNames, templateName } from "@/lib/whatsapp/templates";

process.env.NEXTAUTH_SECRET = "test-secret";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const cfg = () => ({ businessId: "b1", status: "CONNECTED", phoneNumberId: "1", wabaId: "2", accessTokenEnc: encryptSecret("TOKEN"), appSecretEnc: encryptSecret("S") });
const bases = { tracking: "https://calvy.io/shop/q/", dashboard: "https://calvy.io/dashboard/" };
const TOTAL = TEMPLATE_DEFS.length * TEMPLATE_LANGUAGES.length;
const upserts = () => db.tplUpsert.mock.calls.map((c) => c[0] as { create: { name: string; status?: string; reason?: string }; update: Record<string, unknown> });

beforeEach(() => { vi.resetAllMocks(); db.cfgFindUnique.mockResolvedValue(cfg()); db.tplUpsert.mockResolvedValue({}); db.tplUpdateMany.mockResolvedValue({ count: 0 }); });

describe("Install Calvy templates", () => {
  it("a dead token (401 / code 190) stops at the FIRST call, pauses the connection, writes no template rows", async () => {
    const f = vi.fn(async () => json({ error: { code: 190, message: "Error validating access token: Session has expired" } }, 401));
    const out = await installTemplates("b1", bases, f as never);
    expect(out).toMatchObject({ ok: false });
    expect((out as { error: string }).error).toContain("access token");
    expect(f).toHaveBeenCalledTimes(1);          // not 34 failing calls
    expect(db.tplUpsert).not.toHaveBeenCalled(); // nothing is mislabelled
    expect(db.cfgUpdate.mock.calls[0][0].data).toMatchObject({ status: "ERROR" });
  });
  it("a template that could not be created is NOT_INSTALLED (never REJECTED) and keeps the reason", async () => {
    const f = vi.fn(async () => json({ error: { code: 100, message: "Invalid parameter" } }, 400));
    const out = await installTemplates("b1", bases, f as never);
    expect(out).toMatchObject({ ok: true });
    expect((out as { failures: string[] }).failures).toHaveLength(TOTAL);
    expect(f).toHaveBeenCalledTimes(TOTAL + 1);   // every template tried, plus the status refresh read
    for (const u of upserts()) { expect(u.create.status).toBe("NOT_INSTALLED"); expect(u.create.reason).toBe("Invalid parameter"); }
  });
  it("the next Install retries the NOT_INSTALLED ones: created now, status and reason replaced", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => (init?.method === "POST" ? json({ id: "meta1", status: "PENDING" }) : json({ data: [] })));
    const out = await installTemplates("b1", bases, f as never);
    expect((out as { failures: string[] }).failures).toEqual([]);
    expect(upserts()).toHaveLength(TOTAL);
    for (const u of upserts()) expect(u.update).toMatchObject({ status: "PENDING", reason: null, metaId: "meta1" });
  });
  it("needs a CONNECTED connection", async () => {
    db.cfgFindUnique.mockResolvedValue({ ...cfg(), status: "ERROR" });
    const f = vi.fn();
    expect(await installTemplates("b1", bases, f as never)).toEqual({ ok: false, error: "Verify the connection first." });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the Settings list shows only current template names", () => {
  it("asks for the current names only (old versions on Meta are ignored)", async () => {
    db.tplFindMany.mockResolvedValue([]);
    await listCurrentTemplates("b1");
    const where = db.tplFindMany.mock.calls[0][0].where;
    expect(where.businessId).toBe("b1");
    expect(new Set(where.name.in)).toEqual(currentTemplateNames());
    expect(where.name.in).toContain("calvy_token_issued_v2");
    expect(where.name.in).not.toContain("calvy_token_issued_v1");
  });
  it("the three rewritten templates are v2, the others unchanged", () => {
    for (const k of ["token_issued", "token_moved_back", "booking_cancelled"]) expect(templateName(k)).toBe(`calvy_${k}_v2`);
    expect(templateName("token_next")).toBe("calvy_token_next_v1");
  });
});
