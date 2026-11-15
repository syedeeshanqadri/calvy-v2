import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ cfgFindUnique: vi.fn(), cfgUpdate: vi.fn(), cfgCreate: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppConfig: { findUnique: db.cfgFindUnique, update: db.cfgUpdate, create: db.cfgCreate }, whatsAppTemplate: { findMany: vi.fn(async () => []) } } }));

import { encryptSecret } from "@/lib/notifications/secret";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { GET, POST } from "@/app/api/whatsapp/webhook/[key]/route";
import { CredentialsUnreadable, credentialsOf, installTemplates, publicView, refreshTemplates, saveConfig, tryDecrypt, verifyAndStore } from "@/lib/whatsapp/store";

const KEY = process.env.NOTIFY_SECRET_KEY;
afterEach(() => { if (KEY === undefined) delete process.env.NOTIFY_SECRET_KEY; else process.env.NOTIFY_SECRET_KEY = KEY; });

/** A config row saved by "another environment": encrypted under a different key than the one this process then uses. */
function foreignRow() {
  process.env.NOTIFY_SECRET_KEY = "key-of-the-other-environment";
  const row = { businessId: "b1", phoneNumberId: "111", wabaId: "222", accessTokenEnc: encryptSecret("EAAB-token"), appSecretEnc: encryptSecret("app-secret"), verifyTokenEnc: encryptSecret("verify-me"), webhookKey: "wk", status: "CONNECTED", statusReason: null, displayPhone: null, verifiedName: null, qualityRating: null, messagingTier: null, lastCheckedAt: null };
  process.env.NOTIFY_SECRET_KEY = "key-of-this-environment";
  return row;
}
beforeEach(() => { vi.clearAllMocks(); });

describe("credentials saved under a different encryption key", () => {
  it("tryDecrypt returns null instead of throwing", () => {
    const row = foreignRow();
    expect(tryDecrypt(row.accessTokenEnc)).toBeNull();
    expect(tryDecrypt("not-even-a-token")).toBeNull();
  });
  it("the Settings page view does not throw: masked fields are empty and the flag is set", () => {
    const v = publicView(foreignRow() as never)!;
    expect(v.credentialsUnreadable).toBe(true);
    expect(v).toMatchObject({ accessTokenMasked: "", appSecretMasked: "", verifyToken: "" });
  });
  it("a readable config is unaffected", () => {
    process.env.NOTIFY_SECRET_KEY = "same";
    const row = { ...foreignRow(), accessTokenEnc: encryptSecret("EAAB-token"), appSecretEnc: encryptSecret("app-secret"), verifyTokenEnc: encryptSecret("v") };
    expect(publicView(row as never)).toMatchObject({ credentialsUnreadable: false, verifyToken: "v" });
  });
  it("sending code gets a typed error, and Verify / Refresh / Install report it instead of crashing", async () => {
    db.cfgFindUnique.mockResolvedValue(foreignRow());
    expect(() => credentialsOf(foreignRow() as never)).toThrow(CredentialsUnreadable);
    const fetcher = vi.fn();
    expect(await verifyAndStore("b1", fetcher as never)).toMatchObject({ ok: false, reason: expect.stringContaining("cannot be read") });
    expect(db.cfgUpdate.mock.calls[0][0].data).toMatchObject({ status: "ERROR" });
    expect(await refreshTemplates("b1", fetcher as never)).toMatchObject({ ok: false });
    db.cfgFindUnique.mockResolvedValue({ ...foreignRow(), status: "CONNECTED" });
    expect(await installTemplates("b1", { tracking: "t/", dashboard: "d/" }, fetcher as never)).toMatchObject({ ok: false });
    expect(fetcher).not.toHaveBeenCalled(); // never calls Meta with a missing token
  });
  it("saving again requires both secrets, then replaces them and regenerates the verify token", async () => {
    db.cfgFindUnique.mockResolvedValue(foreignRow());
    expect(await saveConfig("b1", { phoneNumberId: "111", wabaId: "222" })).toMatchObject({ ok: false });
    expect(db.cfgUpdate).not.toHaveBeenCalled();
    expect(await saveConfig("b1", { phoneNumberId: "111", wabaId: "222", accessToken: "new-token", appSecret: "new-secret" })).toEqual({ ok: true });
    const data = db.cfgUpdate.mock.calls[0][0].data;
    expect(tryDecrypt(data.accessTokenEnc)).toBe("new-token");
    expect(tryDecrypt(data.verifyTokenEnc)).toBeTruthy(); // readable again
  });
});

describe("webhook with credentials this server cannot read", () => {
  const ctx = { params: Promise.resolve({ key: "wk" }) };
  it("rejects a delivery signed with an EMPTY key (never verifies against a blank secret) and the handshake", async () => {
    db.cfgFindUnique.mockResolvedValue({ businessId: "b1", phoneNumberId: "111", appSecretEnc: foreignRow().appSecretEnc, verifyTokenEnc: foreignRow().verifyTokenEnc });
    const body = JSON.stringify({ entry: [] });
    const forged = "sha256=" + createHmac("sha256", "").update(body).digest("hex");
    const post = await POST(new NextRequest("http://x/api/whatsapp/webhook/wk", { method: "POST", body, headers: { "x-hub-signature-256": forged } }), ctx);
    expect(post.status).toBe(401);
    const get = await GET(new NextRequest("http://x/api/whatsapp/webhook/wk?hub.mode=subscribe&hub.verify_token=&hub.challenge=1"), ctx);
    expect(get.status).toBe(403);
  });
});
