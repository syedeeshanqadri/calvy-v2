import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ANON_NAME, GRACE_DAYS, anonymiseCustomer, cancelDeletion, executeAfterFrom, processDueDeletions, requestDeletion, upcomingBookings } from "@/lib/accountDeletion";
import { hashToken } from "@/lib/auth-tokens";

const NOW = new Date("2026-11-20T10:00:00Z");
type Call = { model: string; fn: string; args: any };
type Cust = { id: string; name: string; email: string; anonymisedAt: Date | null };
type Req = { id: string; customerId: string; status: string; executeAfter: Date; cancelTokenHash: string | null };

/** A database where every model method records its call; the few reads the code depends on return configured data. */
function fakeDb(o: { customers?: Cust[]; upcoming?: Record<string, number>; clients?: { id: string; name: string; phone: string | null; email: string }[]; requests?: Req[]; throwFor?: string } = {}) {
  const calls: Call[] = [];
  const customers = o.customers ?? [{ id: "c1", name: "Asha Rao", email: "asha@x.com", anonymisedAt: null }];
  const requests = o.requests ?? [];
  const clients = o.clients ?? [{ id: "cl1", name: "Asha Rao", phone: "+919876543210", email: "Asha@X.com" }, { id: "cl2", name: "Other Person", phone: "+911111111111", email: "other@x.com" }];
  const upcoming = o.upcoming ?? {};
  const special: Record<string, Record<string, (a: any) => any>> = {
    customer: {
      findUnique: (a) => customers.find((c) => c.id === a.where.id) ?? null,
      update: (a) => { const c = customers.find((x) => x.id === a.where.id)!; Object.assign(c, a.data); return c; },
    },
    appointment: {
      findMany: (a) => {
        const email = String(a.where.client.email.equals).toLowerCase();
        return Array.from({ length: upcoming[email] ?? 0 }, (_, i) => ({ id: `ap${i}`, date: new Date("2026-12-01T00:00:00Z"), business: { name: "Sunrise" } }));
      },
    },
    client: { findMany: (a) => clients.filter((c) => c.email.toLowerCase() === String(a.where.email.equals).toLowerCase()) },
    customerDeletionRequest: {
      findUnique: (a) => requests.find((r) => r.customerId === a.where.customerId) ?? null,
      findMany: (a) => requests.filter((r) => r.status === a.where.status && r.executeAfter <= a.where.executeAfter.lte),
      upsert: (a) => { const cur = requests.find((r) => r.customerId === a.where.customerId); if (cur) Object.assign(cur, a.update); else requests.push({ id: `r${requests.length + 1}`, ...a.create }); },
      updateMany: (a) => {
        const rows = requests.filter((r) => (a.where.cancelTokenHash ? r.cancelTokenHash === a.where.cancelTokenHash : r.customerId === a.where.customerId) && (!a.where.status || r.status === a.where.status));
        rows.forEach((r) => Object.assign(r, a.data));
        return { count: rows.length };
      },
    },
  };
  const model = (name: string) => new Proxy({}, { get: (_t, fn: string) => async (args: any) => { calls.push({ model: name, fn, args }); if (o.throwFor && name === "customer" && fn === "update" && args.where.id === o.throwFor) throw new Error("boom"); return special[name]?.[fn] ? special[name][fn](args) : { count: 1 }; } });
  const db: any = new Proxy({}, { get: (_t, name: string) => (name === "$transaction" ? async (fn: any) => fn(db) : model(name)) });
  return { db, calls, customers, requests };
}
const writes = (calls: Call[]) => calls.filter((c) => /^(update|updateMany|upsert|delete|deleteMany|create|createMany)$/.test(c.fn));
const find = (calls: Call[], model: string, fn: string) => calls.filter((c) => c.model === model && c.fn === fn);

describe("the request", () => {
  it("starts exactly 30 days from now and stores only the hash of the cancel token", async () => {
    const f = fakeDb();
    const r = await requestDeletion(f.db, "c1", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(GRACE_DAYS).toBe(30);
    expect(r.executeAfter.toISOString()).toBe("2026-12-20T10:00:00.000Z");
    expect(executeAfterFrom(NOW).getTime() - NOW.getTime()).toBe(30 * 86_400_000);
    expect(f.requests[0]).toMatchObject({ customerId: "c1", status: "PENDING", cancelTokenHash: hashToken(r.token) });
    expect(JSON.stringify(f.requests)).not.toContain(r.token);
  });
  it("is blocked while there are upcoming bookings, and says which", async () => {
    const f = fakeDb({ upcoming: { "asha@x.com": 2 } });
    const r = await requestDeletion(f.db, "c1", NOW);
    expect(r).toMatchObject({ ok: false, reason: "UPCOMING" });
    expect(r.ok === false && r.reason === "UPCOMING" && r.bookings).toHaveLength(2);
    expect(f.requests).toHaveLength(0);
  });
  it("only live future bookings block (the query asks for confirmed/pending, from now on, matched by email)", async () => {
    const f = fakeDb();
    await upcomingBookings(f.db, "ASHA@x.com", NOW);
    const q = find(f.calls, "appointment", "findMany")[0].args.where;
    expect(q.date).toEqual({ gte: NOW });
    expect(q.status.in).toEqual(["confirmed", "pending", "pending_payment"]);
    expect(q.client.email).toEqual({ equals: "asha@x.com", mode: "insensitive" });
  });
  it("asking twice keeps the first date and makes no second token", async () => {
    const f = fakeDb();
    await requestDeletion(f.db, "c1", NOW);
    const hash = f.requests[0].cancelTokenHash;
    const again = await requestDeletion(f.db, "c1", new Date(NOW.getTime() + 86_400_000));
    expect(again).toMatchObject({ ok: false, reason: "PENDING" });
    expect(f.requests[0].cancelTokenHash).toBe(hash);
  });
  it("an already anonymised or unknown account cannot ask", async () => {
    expect(await requestDeletion(fakeDb({ customers: [{ id: "c1", name: ANON_NAME, email: "x", anonymisedAt: NOW }] }).db, "c1", NOW)).toMatchObject({ reason: "GONE" });
    expect(await requestDeletion(fakeDb().db, "nope", NOW)).toMatchObject({ reason: "GONE" });
  });
});

describe("cancelling", () => {
  it("the emailed link works once", async () => {
    const f = fakeDb();
    const r = await requestDeletion(f.db, "c1", NOW);
    if (!r.ok) throw new Error("setup");
    expect(await cancelDeletion(f.db, { token: r.token }, "customer:email-link", null, NOW)).toBe(true);
    expect(f.requests[0]).toMatchObject({ status: "CANCELLED", cancelTokenHash: null });
    expect(await cancelDeletion(f.db, { token: r.token }, "customer:email-link", null, NOW)).toBe(false);
  });
  it("a wrong or malformed token does nothing", async () => {
    const f = fakeDb();
    await requestDeletion(f.db, "c1", NOW);
    expect(await cancelDeletion(f.db, { token: "a".repeat(64) }, "x")).toBe(false);
    expect(await cancelDeletion(f.db, { token: "junk" }, "x")).toBe(false);
    expect(f.requests[0].status).toBe("PENDING");
  });
  it("the signed-in customer can cancel; after a cancel they can ask again", async () => {
    const f = fakeDb();
    await requestDeletion(f.db, "c1", NOW);
    expect(await cancelDeletion(f.db, { customerId: "c1" }, "customer:c1")).toBe(true);
    expect(await cancelDeletion(f.db, { customerId: "c1" }, "customer:c1")).toBe(false); // only a pending request can be cancelled
    expect((await requestDeletion(f.db, "c1", NOW)).ok).toBe(true);
  });
  it("a request that is already done cannot be cancelled", async () => {
    const f = fakeDb({ requests: [{ id: "r1", customerId: "c1", status: "DONE", executeAfter: NOW, cancelTokenHash: null }] });
    expect(await cancelDeletion(f.db, { customerId: "c1" }, "admin")).toBe(false);
  });
});

describe("anonymising", () => {
  async function run(o: Parameters<typeof fakeDb>[0] = {}) {
    const f = fakeDb(o);
    const res = await anonymiseCustomer(f.db, "c1", "cron", NOW);
    return { f, res };
  }
  it("turns the customer into 'Deleted customer' with no email, login, Google link or sessions", async () => {
    const { f, res } = await run();
    expect(res).toBe("done");
    expect(f.customers[0]).toMatchObject({ name: ANON_NAME, email: "deleted-c1@deleted.invalid", password: null, googleId: null, emailVerified: null, anonymisedAt: NOW, passwordChangedAt: NOW });
    expect(find(f.calls, "customerToken", "deleteMany")[0].args.where).toEqual({ customerId: "c1" });
  });
  it("moves every rewards table to the anonymised id (email and phone identities), so the history stays but cannot be traced", async () => {
    const { f } = await run();
    const tables = ["rewardProgress", "rewardCount", "rewardRedemption", "couponRedemption", "tierGrant", "quarterlyPerk", "fastTrackBoost", "customerLevel"];
    for (const t of tables) {
      const ups = find(f.calls, t, "updateMany").map((c) => `${c.args.where.identity}->${c.args.data.identity}`);
      expect(ups, t).toEqual(["e:asha@x.com->a:c1", "p:919876543210->a:c1-p1"]);
    }
    const refs = find(f.calls, "referral", "updateMany").map((c) => JSON.stringify([c.args.where, c.args.data]));
    expect(refs).toContain(JSON.stringify([{ referrerIdentity: "e:asha@x.com" }, { referrerIdentity: "a:c1" }]));
    expect(refs).toContain(JSON.stringify([{ referredIdentity: "e:asha@x.com" }, { referredIdentity: "a:c1" }]));
    // Nothing in any rewards table keeps the original identity afterwards.
    const stillOld = writes(f.calls).filter((c) => JSON.stringify(c.args.data ?? {}).includes("asha@x.com") && c.model !== "customer");
    expect(stillOld).toEqual([]);
  });
  it("removes the referral codes and the devices seen", async () => {
    const { f } = await run();
    expect(find(f.calls, "referralCode", "deleteMany").map((c) => c.args.where.identity)).toEqual(["e:asha@x.com", "p:919876543210"]);
    expect(find(f.calls, "deviceSeen", "deleteMany")).toHaveLength(2);
  });
  it("strips the person from the business's client record but keeps the bookings (no appointment, payment or invoice is deleted or re-priced)", async () => {
    const { f } = await run();
    const upd = find(f.calls, "client", "updateMany")[0].args;
    expect(upd.where).toEqual({ id: { in: ["cl1"] } }); // only this person's client rows, never another customer's
    expect(upd.data).toMatchObject({ name: ANON_NAME, email: null, phone: null, notes: null, whatsappConsent: false });
    const apptWrites = writes(f.calls).filter((c) => c.model === "appointment");
    expect(apptWrites.every((c) => c.fn === "updateMany" && JSON.stringify(Object.keys(c.args.data)) === JSON.stringify(["patientName"]))).toBe(true);
    for (const forbidden of ["payment", "subscriptionInvoice", "confirmationWaiver", "service", "business", "user"]) expect(writes(f.calls).filter((c) => c.model === forbidden)).toEqual([]);
  });
  it("wipes the person's address from the delivery log and opt-out lists", async () => {
    const { f } = await run();
    const out = find(f.calls, "notificationOutbox", "updateMany")[0].args;
    expect(out.where).toEqual({ audience: "CUSTOMER", recipient: { in: ["asha@x.com", "+919876543210"] } });
    expect(out.data).toEqual({ recipient: "deleted", payload: {}, secret: null });
    expect(find(f.calls, "emailLog", "updateMany")[0].args.data).toEqual({ to: "deleted" });
    expect(find(f.calls, "notificationOptOut", "deleteMany")[0].args.where).toEqual({ recipient: "asha@x.com" });
    expect(find(f.calls, "whatsAppOptOut", "deleteMany")[0].args.where).toEqual({ phone: { in: ["+919876543210"] } });
  });
  it("marks the request done and clears its token", async () => {
    const { f } = await run({ requests: [{ id: "r1", customerId: "c1", status: "PENDING", executeAfter: NOW, cancelTokenHash: "h" }] });
    expect(f.requests[0]).toMatchObject({ status: "DONE", cancelTokenHash: null, processedBy: "cron" });
  });
  it("refuses when bookings are upcoming again: nothing is written", async () => {
    const { f, res } = await run({ upcoming: { "asha@x.com": 1 } });
    expect(res).toBe("blocked");
    expect(writes(f.calls)).toEqual([]);
  });
  it("is safe to run twice, and reports a missing customer", async () => {
    const f = fakeDb();
    expect(await anonymiseCustomer(f.db, "c1", "cron", NOW)).toBe("done");
    f.calls.length = 0;
    expect(await anonymiseCustomer(f.db, "c1", "cron", NOW)).toBe("already");
    expect(writes(f.calls)).toEqual([]);
    expect(await anonymiseCustomer(fakeDb().db, "zzz", "cron", NOW)).toBe("missing");
  });
  it("a customer with no business client rows still anonymises cleanly", async () => {
    const { f, res } = await run({ clients: [] });
    expect(res).toBe("done");
    expect(find(f.calls, "client", "updateMany")).toEqual([]);
  });
});

describe("the nightly job", () => {
  const pending = (id: string, customerId: string, executeAfter: string): Req => ({ id, customerId, status: "PENDING", executeAfter: new Date(executeAfter), cancelTokenHash: null });
  it("anonymises only requests whose 30 days are up", async () => {
    const f = fakeDb({
      customers: [{ id: "c1", name: "A", email: "a@x.com", anonymisedAt: null }, { id: "c2", name: "B", email: "b@x.com", anonymisedAt: null }],
      requests: [pending("r1", "c1", "2026-11-19T00:00:00Z"), pending("r2", "c2", "2026-12-15T00:00:00Z")],
    });
    expect(await processDueDeletions(f.db, NOW)).toEqual({ processed: 1, blocked: 0, failed: 0 });
    expect(f.customers.find((c) => c.id === "c1")?.name).toBe(ANON_NAME);
    expect(f.customers.find((c) => c.id === "c2")?.name).toBe("B");
  });
  it("a customer with new upcoming bookings is skipped and stays pending", async () => {
    const f = fakeDb({ customers: [{ id: "c1", name: "A", email: "a@x.com", anonymisedAt: null }], requests: [pending("r1", "c1", "2026-11-19T00:00:00Z")], upcoming: { "a@x.com": 1 } });
    expect(await processDueDeletions(f.db, NOW)).toEqual({ processed: 0, blocked: 1, failed: 0 });
    expect(f.requests[0].status).toBe("PENDING");
  });
  it("one failing person does not stop the others", async () => {
    const f = fakeDb({
      customers: [{ id: "c1", name: "A", email: "a@x.com", anonymisedAt: null }, { id: "c2", name: "B", email: "b@x.com", anonymisedAt: null }],
      requests: [pending("r1", "c1", "2026-11-18T00:00:00Z"), pending("r2", "c2", "2026-11-19T00:00:00Z")], throwFor: "c1",
    });
    expect(await processDueDeletions(f.db, NOW)).toEqual({ processed: 1, blocked: 0, failed: 1 });
  });
  it("cancelled and done requests are never touched", async () => {
    const f = fakeDb({ requests: [{ ...pending("r1", "c1", "2026-01-01T00:00:00Z"), status: "CANCELLED" }] });
    expect(await processDueDeletions(f.db, NOW)).toEqual({ processed: 0, blocked: 0, failed: 0 });
  });
});

describe("wiring (source checks)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("the instant delete is gone", () => {
    expect(read("app/api/customer/profile/route.ts")).not.toMatch(/DELETE_handler|customer\.delete\(/);
    expect(read("app/account/(app)/MyClient.tsx")).not.toContain("Delete permanently");
    expect(read("app/account/(app)/MyClient.tsx")).toContain("Request account deletion");
    expect(read("app/api/customer/deletion/route.ts")).not.toMatch(/customer\.delete\(/);
  });
  it("owner accounts are never touched by the anonymiser", () => {
    const src = read("lib/accountDeletion.ts");
    expect(src).not.toMatch(/tx\.user\.|tx\.business\.|tx\.teamMember\.|tx\.pushDevice\./);
  });
  it("the cron is scheduled and protected like the other cron", () => {
    expect(JSON.parse(read("vercel.json")).crons.map((c: { path: string }) => c.path)).toContain("/api/cron/account-deletions");
    const route = read("app/api/cron/account-deletions/route.ts");
    expect(route).toContain("isCronAuthorized(req)");
    expect(route).toContain("processDueDeletions");
  });
  it("admin process and cancel are audited with a reason, and the audit holds ids, never email or phone", () => {
    const src = read("app/api/admin/customers/deletions/[id]/route.ts");
    for (const needle of ["requireAdminApi", "cleanReason", "adminAudit(tx", "customer.deletion_processed", "customer.deletion_cancelled"]) expect(src).toContain(needle);
    expect(src).not.toMatch(/detail: \{[^}]*email/);
  });
  it("Admin → Customers shows 'Deletion pending' with process and cancel", () => {
    const page = read("app/admin/customers/page.tsx");
    expect(page).toContain("Deletion pending");
    expect(read("app/admin/customers/DeletionActions.tsx")).toMatch(/Process now[\s\S]*Cancel request|Cancel request[\s\S]*Process now/);
    expect(read("components/admin/AdminLayout.tsx")).toContain("/admin/customers");
  });
  it("the privacy and data-deletion pages describe the 30 days and the anonymising", () => {
    for (const f of ["app/privacy/page.tsx", "app/data-deletion/page.tsx"]) {
      const t = read(f);
      expect(t).toContain("30 days");
      expect(t).toMatch(/anonymis/);
    }
    expect(read("app/privacy/page.tsx")).toContain("Deleted customer");
  });
  it("the cancel link needs no sign-in but is rate limited and single use", () => {
    const r = read("app/api/customer/deletion/cancel/route.ts");
    expect(r).toContain("deletion-cancel:");
    expect(read("lib/accountDeletion.ts")).toMatch(/cancelTokenHash: null/);
  });
});
