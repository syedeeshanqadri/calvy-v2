import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  cfgFindUnique: vi.fn(), cfgUpdate: vi.fn(),
  tplUpsert: vi.fn(), tplUpdateMany: vi.fn(), tplFindMany: vi.fn(), tplCreate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findUnique: db.cfgFindUnique, update: db.cfgUpdate },
    whatsAppTemplate: { upsert: db.tplUpsert, updateMany: db.tplUpdateMany, findMany: db.tplFindMany, create: db.tplCreate },
  },
}));

import { encryptSecret } from "@/lib/notifications/secret";
import { connectionTestMessage } from "@/lib/whatsapp/events";
import { installTemplates, listCurrentTemplates, refreshTemplates, usableLanguages } from "@/lib/whatsapp/store";
import { TEMPLATE_DEFS, buildTemplatePayload, currentTemplateNames, languagesOf, templateName } from "@/lib/whatsapp/templates";

process.env.NEXTAUTH_SECRET = "test-secret";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const cfg = () => ({ businessId: "b1", status: "CONNECTED", phoneNumberId: "1", wabaId: "2", accessTokenEnc: encryptSecret("TOKEN"), appSecretEnc: encryptSecret("S") });
const bases = { tracking: "https://calvy.io/shop/q/", dashboard: "https://calvy.io/dashboard/" };
const TOTAL = TEMPLATE_DEFS.reduce((n, d) => n + languagesOf(d).length, 0);
const upserts = () => db.tplUpsert.mock.calls.map((c) => c[0] as { create: { name: string; status?: string; reason?: string }; update: Record<string, unknown> });

beforeEach(() => { vi.resetAllMocks(); db.cfgFindUnique.mockResolvedValue(cfg()); db.tplUpsert.mockResolvedValue({}); db.tplUpdateMany.mockResolvedValue({ count: 0 }); db.tplFindMany.mockResolvedValue([]); });

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

describe("Refresh status (sync from Meta)", () => {
  it("writes Meta's APPROVED into our row, pages through everything, ignores non-calvy templates", async () => {
    const name = templateName("token_issued");
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => {
      urls.push(url);
      return json({ data: [{ id: "m1", name, language: "en", status: "APPROVED" }, { id: "m2", name: "someone_elses", language: "en", status: "APPROVED" }] });
    });
    db.tplUpdateMany.mockResolvedValue({ count: 1 });
    const out = await refreshTemplates("b1", f as never);
    expect(out).toMatchObject({ ok: true });
    expect(urls[0]).not.toContain("name=");
    expect(db.tplUpdateMany).toHaveBeenCalledTimes(1);
    expect(db.tplUpdateMany.mock.calls[0][0]).toMatchObject({ where: { name, language: "en" }, data: { status: "APPROVED", metaId: "m1" } });
  });
  it("adds a row for a current template that exists on Meta but not here", async () => {
    const name = templateName("token_issued");
    const f = vi.fn(async () => json({ data: [{ id: "m1", name, language: "hi", status: "approved" }] }));
    await refreshTemplates("b1", f as never);
    expect(db.tplCreate.mock.calls[0][0].data).toMatchObject({ name, language: "hi", status: "APPROVED" });
  });
  it("reports current templates our table has but Meta does not return (wrong Account ID)", async () => {
    const name = templateName("token_issued");
    db.tplFindMany.mockResolvedValue([{ name, language: "en", status: "PENDING" }]);
    const out = await refreshTemplates("b1", (async () => json({ data: [] })) as never);
    expect((out as { missing: string[] }).missing).toEqual([`${name} (en)`]);
  });
});

describe("Install: templates that already exist", () => {
  it("'There is already English content for this template' is ALREADY_EXISTS: no failure, row kept, status fetched", async () => {
    const msg = "There is already English content for this template";
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? json({ error: { code: 100, message: msg } }, 400) : json({ data: [] })));
    const out = await installTemplates("b1", bases, f as never);
    expect(out).toMatchObject({ ok: true, failures: [] });
    for (const u of db.tplUpsert.mock.calls.map((c) => c[0])) expect(u.update).toEqual({});
    expect(f.mock.calls.some((c) => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === "GET")).toBe(true);
  });
  it("code 2388024 is also ALREADY_EXISTS", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? json({ error: { code: 2388024, message: "x" } }, 400) : json({ data: [] })));
    expect(await installTemplates("b1", bases, f as never)).toMatchObject({ ok: true, failures: [] });
  });
  it("skips templates that already have a row with a Meta id", async () => {
    const name = templateName("booking_confirmed");
    db.tplFindMany.mockResolvedValue([{ name, language: "en" }, { name, language: "hi" }]);
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? json({ id: "m", status: "PENDING" }) : json({ data: [] })));
    await installTemplates("b1", bases, f as never);
    const posts = f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST").length;
    expect(posts).toBe(TOTAL - 2);
  });
});

describe("MARKETING reclassification and the rewritten set", () => {
  it("Refresh stores the category Meta reports", async () => {
    const name = templateName("visit_thanks");
    const f = vi.fn(async () => json({ data: [{ id: "m1", name, language: "en", status: "APPROVED", category: "MARKETING" }] }));
    db.tplUpdateMany.mockResolvedValue({ count: 1 });
    await refreshTemplates("b1", f as never);
    expect(db.tplUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "APPROVED", category: "MARKETING" });
    expect((f.mock.calls as unknown as [string][])[0][0]).toContain("category");
  });
  it("usableLanguages drops APPROVED-but-MARKETING templates (the email goes instead); null category still counts", async () => {
    db.tplFindMany.mockResolvedValue([{ language: "en", category: "MARKETING" }, { language: "hi", category: "UTILITY" }]);
    expect(await usableLanguages("b1", "x")).toEqual(["hi"]);
    db.tplFindMany.mockResolvedValue([{ language: "en", category: null }]);
    expect(await usableLanguages("b1", "x")).toEqual(["en"]);
  });
  it("the Settings list carries the category so a marketing template can be flagged", async () => {
    const name = templateName("visit_thanks");
    db.tplFindMany.mockResolvedValue([{ name, language: "en", status: "APPROVED", reason: null, category: "MARKETING" }]);
    expect((await listCurrentTemplates("b1"))[0]).toMatchObject({ category: "MARKETING" });
  });
  it("staff_alert is English only: no Hindi created, no Hindi row listed", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? json({ id: "m", status: "PENDING" }) : json({ data: [] })));
    await installTemplates("b1", bases, f as never);
    const names = f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST").map((c) => JSON.parse((c[1] as RequestInit).body as string)).filter((b) => b.name === templateName("staff_alert"));
    expect(names.map((b) => b.language)).toEqual(["en"]);
    db.tplFindMany.mockResolvedValue([{ name: templateName("staff_alert"), language: "hi", status: "APPROVED", reason: null, category: "MARKETING" }]);
    expect(await listCurrentTemplates("b1")).toEqual([]);
  });
  it("review_request is gone from the WhatsApp set, the other four are strictly transactional v2s", () => {
    expect(TEMPLATE_DEFS.some((d) => d.key === "review_request")).toBe(false);
    for (const k of ["visit_thanks", "visit_thanks_follow_up", "booking_no_show"]) {
      const d = TEMPLATE_DEFS.find((x) => x.key === k)!;
      expect(d.version).toBe(k === "visit_thanks_follow_up" ? 3 : 2);
      for (const l of ["en", "hi"] as const) expect(d.body[l], `${k} ${l}`).not.toMatch(/thank|miss(ed)? you|again|धन्यवाद|कमी खली|फिर/i);
    }
    expect(TEMPLATE_DEFS.find((d) => d.key === "visit_thanks")!.body.en).toBe("Hello {{1}}, your visit to {{2}} on {{3}} has been marked as completed. This is an update for your records. No action is needed.");
    expect(TEMPLATE_DEFS.find((d) => d.key === "booking_no_show")!.body.en).toBe("Hello {{1}}, your booking for {{2}} at {{3}} on {{4}} was marked as missed. This is an update for your records.");
    expect(buildTemplatePayload(TEMPLATE_DEFS[0], "en", bases)).not.toHaveProperty("allow_category_change");
  });
});

describe("connection_test dropped; token templates English only", () => {
  const posted = async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? json({ id: "m", status: "PENDING" }) : json({ data: [] })));
    await installTemplates("b1", bases, f as never);
    return f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST").map((c) => JSON.parse((c[1] as RequestInit).body as string) as { name: string; language: string });
  };
  it("Install never creates connection_test, and its rows are hidden from Settings", async () => {
    expect(TEMPLATE_DEFS.some((d) => d.key === "connection_test")).toBe(false);
    expect((await posted()).some((b) => b.name.includes("connection_test"))).toBe(false);
    db.tplFindMany.mockResolvedValue([{ name: "calvy_connection_test_v2", language: "en", status: "APPROVED", reason: null, category: "MARKETING" }]);
    expect(await listCurrentTemplates("b1")).toEqual([]);
  });
  it("token_* templates are English only: no Hindi created, rejected Hindi rows hidden, English is the fallback", async () => {
    const keys = ["token_issued", "token_moved_back", "token_next", "token_closed"];
    const names = keys.map((k) => templateName(k));
    const sent = (await posted()).filter((b) => names.includes(b.name));
    expect(sent.map((b) => b.language).sort()).toEqual(["en", "en", "en", "en"]);
    db.tplFindMany.mockResolvedValue(names.flatMap((name) => [{ name, language: "en", status: "APPROVED", reason: null, category: "UTILITY" }, { name, language: "hi", status: "REJECTED", reason: "INCORRECT_CATEGORY", category: null }]));
    const listed = await listCurrentTemplates("b1");
    expect(listed.map((t) => t.language)).toEqual(["en", "en", "en", "en"]);
  });
  it("the test message rides on staff_alert: business name + a plain test line, button suffix, no personal data", () => {
    const m = connectionTestMessage("Glow Studio");
    expect(m).toEqual({ key: "staff_alert", params: ["Glow Studio", "WhatsApp connection test for Glow Studio."], buttonSuffix: "appointments" });
    expect(m.params.length).toBe(TEMPLATE_DEFS.find((d) => d.key === "staff_alert")!.params.length);
    expect(templateName("staff_alert")).toBe("calvy_staff_alert_v1");
  });
});
