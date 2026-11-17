import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const PHONE = "1415181481681339";
const WABA = "109999999999999";
const db = vi.hoisted(() => ({
  cfgFindFirst: vi.fn(), evCreate: vi.fn(), outboxFindFirst: vi.fn(), outboxUpdate: vi.fn(), optOutUpsert: vi.fn(), tplUpdateMany: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findFirst: db.cfgFindFirst, update: vi.fn(), findUnique: vi.fn() },
    whatsAppWebhookEvent: { create: db.evCreate, deleteMany: vi.fn(async () => ({})) },
    notificationOutbox: { findFirst: db.outboxFindFirst, update: db.outboxUpdate },
    whatsAppOptOut: { upsert: db.optOutUpsert },
    whatsAppTemplate: { updateMany: db.tplUpdateMany },
  },
}));

import { NextRequest } from "next/server";
import { encryptSecret } from "@/lib/notifications/secret";
import { POST } from "@/app/api/whatsapp/webhook/route";

process.env.NEXTAUTH_SECRET = "test-secret";
const CALVY_SECRET = "calvy-app-secret";
const OWN_SECRET = "manual-numbers-own-app-secret";
const sign = (raw: string, secret: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const post = (raw: string, sig: string | null) => new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: sig ? { "x-hub-signature-256": sig } : {} });
/** The MANUAL test number: its own stored app secret (encrypted), no Embedded Signup. */
const manual = (over: Record<string, unknown> = {}) => ({ businessId: "bTest", phoneNumberId: PHONE, source: "MANUAL", appSecretEnc: encryptSecret(OWN_SECRET), ...over });
const delivery = (changes: object[]) => JSON.stringify({ entry: [{ id: WABA, time: 1, changes }] });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.META_APP_SECRET = CALVY_SECRET;
  db.evCreate.mockResolvedValue({});
  db.optOutUpsert.mockResolvedValue({}); db.outboxUpdate.mockResolvedValue({}); db.tplUpdateMany.mockResolvedValue({ count: 1 });
  db.cfgFindFirst.mockImplementation(async ({ where }: { where: { phoneNumberId?: string; wabaId?: string } }) => (where.phoneNumberId === PHONE || where.wabaId === WABA ? manual() : null));
});

const status = delivery([{ field: "messages", value: { metadata: { phone_number_id: PHONE }, statuses: [{ id: "wamid.A", status: "delivered" }] } }]);
const stop = delivery([{ field: "messages", value: { metadata: { phone_number_id: PHONE }, messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }] } }]);
const tpl = delivery([
  { field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "calvy_booking_confirmed_v1", message_template_language: "en" } },
  { field: "template_category_update", value: { message_template_name: "calvy_booking_confirmed_v1", message_template_language: "en", new_category: "MARKETING" } },
]);

describe.each([["Calvy's app secret (the number is in the Calvy app)", CALVY_SECRET], ["the number's own stored app secret (another Meta app)", OWN_SECRET]])("MANUAL config via the global webhook, signed with %s", (_n, secret) => {
  it("delivery status is routed by phone_number_id to the business's outbox row", async () => {
    db.outboxFindFirst.mockResolvedValue({ id: "o1", deliveryStatus: "sent" });
    expect((await POST(post(status, sign(status, secret)))).status).toBe(200);
    expect(db.cfgFindFirst.mock.calls[0][0].where).toEqual({ phoneNumberId: PHONE });
    expect(db.outboxFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: "bTest", channel: "WHATSAPP", providerId: "wamid.A" } }));
    expect(db.outboxUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { deliveryStatus: "delivered", deliveryError: null } });
  });
  it("a STOP reply becomes an opt-out for that business", async () => {
    expect((await POST(post(stop, sign(stop, secret)))).status).toBe(200);
    expect(db.optOutUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId_phone: { businessId: "bTest", phone: "+919876543210" } } }));
  });
  it("template status and category updates (no phone id: routed by WABA id) update that business's templates", async () => {
    expect((await POST(post(tpl, sign(tpl, secret)))).status).toBe(200);
    expect(db.cfgFindFirst.mock.calls[0][0].where).toEqual({ wabaId: WABA });
    const writes = db.tplUpdateMany.mock.calls.map((c) => c[0]);
    expect(writes[0]).toMatchObject({ where: { businessId: "bTest", name: "calvy_booking_confirmed_v1", language: "en" }, data: { status: "APPROVED" } });
    expect(writes[1]).toMatchObject({ where: { businessId: "bTest", name: "calvy_booking_confirmed_v1" }, data: { category: "MARKETING" } });
  });
});

describe("signature and unknown numbers", () => {
  it("a wrong or missing signature is rejected and nothing is written", async () => {
    for (const sig of [null, sign(stop, "some-other-secret"), "sha256=00"]) expect((await POST(post(stop, sig))).status).toBe(401);
    expect((await POST(post(`${stop} `, sign(stop, OWN_SECRET)))).status).toBe(401); // signed a different body
    expect(db.optOutUpsert).not.toHaveBeenCalled();
    expect(db.evCreate).not.toHaveBeenCalled();
  });
  it("a business's own secret cannot be used for another business's number", async () => {
    const other = delivery([{ field: "messages", value: { metadata: { phone_number_id: "999" }, messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }] } }]);
    db.cfgFindFirst.mockImplementation(async ({ where }: { where: { phoneNumberId?: string } }) => (where.phoneNumberId === "999" ? manual({ businessId: "bOther", phoneNumberId: "999", appSecretEnc: encryptSecret("bOthers-secret") }) : manual()));
    expect((await POST(post(other, sign(other, OWN_SECRET)))).status).toBe(401);
    expect(db.optOutUpsert).not.toHaveBeenCalled();
  });
  it("a delivery mixing two businesses, signed with one business's secret, touches only that business", async () => {
    const mixed = delivery([
      { field: "messages", value: { metadata: { phone_number_id: PHONE }, messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }] } },
      { field: "messages", value: { metadata: { phone_number_id: "999" }, messages: [{ from: "919811111111", type: "text", text: { body: "STOP" } }] } },
    ]);
    db.cfgFindFirst.mockImplementation(async ({ where }: { where: { phoneNumberId?: string } }) => (where.phoneNumberId === "999" ? manual({ businessId: "bOther", phoneNumberId: "999", appSecretEnc: encryptSecret("bOthers-secret") }) : manual()));
    expect((await POST(post(mixed, sign(mixed, OWN_SECRET)))).status).toBe(200);
    expect(db.optOutUpsert).toHaveBeenCalledTimes(1);
    expect(db.optOutUpsert.mock.calls[0][0].where.businessId_phone.businessId).toBe("bTest");
  });
  it("an unknown number or account, correctly signed, is logged and answered 200", async () => {
    db.cfgFindFirst.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const raw = delivery([{ field: "messages", value: { metadata: { phone_number_id: "404" }, statuses: [{ id: "w", status: "sent" }] } }]);
    expect((await POST(post(raw, sign(raw, CALVY_SECRET)))).status).toBe(200);
    expect(warn).toHaveBeenCalled();
    expect(db.outboxFindFirst).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("a retried delivery is applied once", async () => {
    const seen = new Set<string>();
    db.evCreate.mockImplementation(async ({ data }: { data: { key: string } }) => { if (seen.has(data.key)) throw Object.assign(new Error("dup"), { code: "P2002" }); seen.add(data.key); });
    await POST(post(stop, sign(stop, OWN_SECRET))); await POST(post(stop, sign(stop, OWN_SECRET)));
    expect(db.optOutUpsert).toHaveBeenCalledTimes(1);
  });
});
