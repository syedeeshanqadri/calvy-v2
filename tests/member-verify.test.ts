import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: async () => { throw new Error("no request"); } }));

import { signDeviceTicket, DEVICE_TTL_MS, readDeviceTicket } from "@/lib/verifiedDevice";
import { isVerifiedBooker, signVerifiedTicket, verifiedCustomerId } from "@/lib/verifiedLimits";
import { signTicket } from "@/lib/signedTicket";
import { consumeMemberLink, maskName, memberHintFor, memberLinkUrl, requestMemberLink } from "@/lib/memberLink";
import { hashToken } from "@/lib/auth-tokens";
import { levelModels } from "./helpers/levelsFake";

process.env.NEXTAUTH_SECRET = "test-secret";
const NOW = new Date("2026-11-20T10:00:00Z");

type Cust = { id: string; email: string; name: string; emailVerified: Date | null };
type Tok = { id: string; customerId: string; purpose: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };

function fakeDb(o: { customers?: Cust[]; level?: string; businesses?: string[]; clients?: { email: string; name: string }[] } = {}) {
  const lv = levelModels();
  const customers = o.customers ?? [{ id: "c1", email: "asha@x.com", name: "Asha Rao", emailVerified: new Date("2026-01-01T00:00:00Z") }];
  const tokens: Tok[] = [];
  const db = {
    ...lv.models,
    customer: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => customers.find((c) => (where.id ? c.id === where.id : c.email === where.email)) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; emailVerified: null }; data: { emailVerified: Date } }) => {
        const c = customers.find((x) => x.id === where.id && x.emailVerified === null);
        if (!c) return { count: 0 };
        c.emailVerified = data.emailVerified;
        return { count: 1 };
      },
    },
    client: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => (o.clients ?? []).find((c) => c.email === where.email.equals) ?? null },
    business: { findUnique: async ({ where }: { where: { slug: string } }) => ((o.businesses ?? ["sunrise"]).includes(where.slug) ? { slug: where.slug } : null) },
    customerToken: {
      create: async ({ data }: { data: Omit<Tok, "id" | "usedAt"> }) => { tokens.push({ id: `t${tokens.length + 1}`, usedAt: null, ...data }); },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
        const t = tokens.find((x) => x.id === where.id && x.usedAt === null);
        if (!t) return { count: 0 };
        t.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
  };
  if (o.level) lv.levels.set("e:asha@x.com", { identity: "e:asha@x.com", level: o.level, levelSince: NOW, lastAttendedAt: NOW, pendingLevelUp: null });
  return { db: db as never, customers, tokens, lv };
}

beforeEach(() => { process.env.NEXTAUTH_SECRET = "test-secret"; });

describe("the masked hint", () => {
  it("masks to one letter and stars, and never fails on odd names", () => {
    expect(maskName("Asha Rao")).toBe("A***");
    expect(maskName("  élodie  ")).toBe("É***");
    expect(maskName("")).toBe("a member");
    expect(maskName(null)).toBe("a member");
  });
  it("a member (level above Starter) gets a hint with only the masked first name", async () => {
    const f = fakeDb({ level: "REGULAR" });
    const h = await memberHintFor(f.db, "ASHA@x.com", NOW);
    expect(h).toEqual({ maskedName: "A***" });
    expect(JSON.stringify(h)).not.toMatch(/Asha|Rao|REGULAR|Regular|level|fee|900/i);
  });
  it("Starter, no account, or a bad email: no hint, so nothing is revealed", async () => {
    expect(await memberHintFor(fakeDb({ level: "STARTER" }).db, "asha@x.com", NOW)).toBeNull();
    expect(await memberHintFor(fakeDb().db, "asha@x.com", NOW)).toBeNull();
    expect(await memberHintFor(fakeDb({ level: "PRO" }).db, "nobody@x.com", NOW)).toBeNull();
    expect(await memberHintFor(fakeDb({ level: "PRO" }).db, "not-an-email", NOW)).toBeNull();
  });
  it("a level that has decayed to Starter no longer shows a hint", async () => {
    const f = fakeDb({ level: "REGULAR" });
    expect(await memberHintFor(f.db, "asha@x.com", new Date("2028-01-01T00:00:00Z"))).toBeNull();
  });
  it("uses the booking name when there is no account", async () => {
    const f = fakeDb({ customers: [], level: "REGULAR", clients: [{ email: "asha@x.com", name: "Asha Rao" }] });
    expect(await memberHintFor(f.db, "asha@x.com", NOW)).toEqual({ maskedName: "A***" });
  });
});

describe("the emailed sign-in link", () => {
  it("goes only to an existing member, to their own address", async () => {
    const f = fakeDb({ level: "INSIDER" });
    const r = await requestMemberLink(f.db, { email: "asha@x.com", businessSlug: "sunrise", service: "svc1", rootDomain: "calvy.io", now: NOW });
    expect(r.send?.to).toBe("asha@x.com");
    expect(r.send?.url).toMatch(/^https:\/\/sunrise\.calvy\.io\/api\/customer\/member-link\/open\?token=[a-f0-9]{64}&business=sunrise&service=svc1$/);
    expect(f.tokens).toHaveLength(1);
    expect(f.tokens[0]).toMatchObject({ purpose: "member-link", customerId: "c1" });
    expect(f.tokens[0].expiresAt.getTime() - NOW.getTime()).toBe(15 * 60_000);
  });
  it("only the hash of the token is stored", async () => {
    const f = fakeDb({ level: "INSIDER" });
    const r = await requestMemberLink(f.db, { email: "asha@x.com", businessSlug: "sunrise", rootDomain: "calvy.io", now: NOW });
    const token = /token=([a-f0-9]{64})/.exec(r.send!.url)![1];
    expect(f.tokens[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(f.tokens)).not.toContain(token);
  });
  it("creates nothing and sends nothing for a Starter, an unknown address or an unknown business (same answer to the caller)", async () => {
    for (const f of [fakeDb({ level: "STARTER" }), fakeDb(), fakeDb({ level: "PRO", customers: [] })]) {
      const r = await requestMemberLink(f.db, { email: "asha@x.com", businessSlug: "sunrise", rootDomain: "calvy.io", now: NOW });
      expect(r.send).toBeNull();
      expect(f.tokens).toHaveLength(0);
    }
    const f = fakeDb({ level: "PRO" });
    expect((await requestMemberLink(f.db, { email: "asha@x.com", businessSlug: "nope", rootDomain: "calvy.io", now: NOW })).send).toBeNull();
  });
  it("opens on the root host where businesses are not on subdomains", () => {
    expect(memberLinkUrl({ slug: "sunrise", token: "t", rootDomain: "calvy-v2.vercel.app" })).toMatch(/^https:\/\/calvy-v2\.vercel\.app\/api\/customer\/member-link\/open\?/);
    expect(memberLinkUrl({ slug: "sunrise", token: "t", rootDomain: "localhost:3000" })).toMatch(/^http:\/\/localhost:3000\/api\//);
  });

  async function link(f: ReturnType<typeof fakeDb>) {
    const r = await requestMemberLink(f.db, { email: "asha@x.com", businessSlug: "sunrise", rootDomain: "calvy.io", now: NOW });
    return /token=([a-f0-9]{64})/.exec(r.send!.url)![1];
  }
  it("redeems once: the second click does nothing", async () => {
    const f = fakeDb({ level: "INSIDER" });
    const t = await link(f);
    expect(await consumeMemberLink(f.db, t, NOW)).toEqual({ customerId: "c1" });
    expect(await consumeMemberLink(f.db, t, NOW)).toBeNull();
  });
  it("expires after 15 minutes", async () => {
    const f = fakeDb({ level: "INSIDER" });
    const t = await link(f);
    expect(await consumeMemberLink(f.db, t, new Date(NOW.getTime() + 15 * 60_000 - 1))).toEqual({ customerId: "c1" });
    const f2 = fakeDb({ level: "INSIDER" });
    const t2 = await link(f2);
    expect(await consumeMemberLink(f2.db, t2, new Date(NOW.getTime() + 15 * 60_000))).toBeNull();
  });
  it("a guessed, malformed or other-purpose token is refused", async () => {
    const f = fakeDb({ level: "INSIDER" });
    await link(f);
    expect(await consumeMemberLink(f.db, "a".repeat(64), NOW)).toBeNull();
    expect(await consumeMemberLink(f.db, "short", NOW)).toBeNull();
    f.tokens[0].purpose = "reset";
    expect(await consumeMemberLink(f.db, "b".repeat(64), NOW)).toBeNull();
    const t = "c".repeat(64);
    f.tokens.push({ id: "x", customerId: "c1", purpose: "reset", tokenHash: hashToken(t), expiresAt: new Date(NOW.getTime() + 60_000), usedAt: null });
    expect(await consumeMemberLink(f.db, t, NOW)).toBeNull(); // a password-reset token cannot be used as a member link
  });
  it("clicking proves the mailbox, so the customer's email becomes verified", async () => {
    const f = fakeDb({ level: "INSIDER", customers: [{ id: "c1", email: "asha@x.com", name: "Asha Rao", emailVerified: null }] });
    const t = await link(f);
    await consumeMemberLink(f.db, t, NOW);
    expect(f.customers[0].emailVerified).toEqual(NOW);
  });
});

describe("the remembered-device cookie (90 days)", () => {
  const verifiedCustomer = { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "c1" ? { email: "asha@x.com", emailVerified: new Date("2026-01-01T00:00:00Z") } : where.id === "c2" ? { email: "asha@x.com", emailVerified: null } : null) };
  const db = { customer: verifiedCustomer } as never;
  it("is a signed ticket that lasts 90 days", () => {
    expect(DEVICE_TTL_MS).toBe(90 * 24 * 3_600_000);
    const ticket = signDeviceTicket("c1", NOW.getTime());
    expect(ticket.split(".")).toHaveLength(3);
  });
  it("a valid ticket verifies the booking for that customer's own email", async () => {
    const t = signDeviceTicket("c1");
    expect(await isVerifiedBooker(db, [t], "asha@x.com")).toBe(true);
    expect(await verifiedCustomerId(db, [t], "ASHA@x.com")).toBe("c1");
  });
  it("never lends verified status to someone else's email", async () => {
    expect(await isVerifiedBooker(db, [signDeviceTicket("c1")], "someone-else@x.com")).toBe(false);
  });
  it("needs a verified customer", async () => expect(await isVerifiedBooker(db, [signDeviceTicket("c2")], "asha@x.com")).toBe(false));
  it("expires after 90 days", async () => {
    const old = signDeviceTicket("c1", Date.now() - 91 * 24 * 3_600_000);
    expect(await isVerifiedBooker(db, [old], "asha@x.com")).toBe(false);
    const edge = signDeviceTicket("c1", Date.now() - 89 * 24 * 3_600_000);
    expect(await isVerifiedBooker(db, [edge], "asha@x.com")).toBe(true);
  });
  it("a forged, tampered or wrongly-purposed ticket is refused", async () => {
    const good = signDeviceTicket("c1");
    expect(await isVerifiedBooker(db, [good.slice(0, -2) + "00"], "asha@x.com")).toBe(false);
    expect(await isVerifiedBooker(db, [signTicket("password-reset", "c1", "test-secret", 60_000)], "asha@x.com")).toBe(false);
    expect(await isVerifiedBooker(db, [signTicket("verified-device", "c1", "another-secret", 60_000)], "asha@x.com")).toBe(false);
    expect(await isVerifiedBooker(db, ["junk"], "asha@x.com")).toBe(false);
  });
  it("the existing 2-hour Book again ticket still works", async () => expect(await isVerifiedBooker(db, [signVerifiedTicket("c1")], "asha@x.com")).toBe(true));
  it("without a request (no cookie jar) the ticket simply reads as absent", async () => expect(await readDeviceTicket()).toBeNull());
});

describe("privacy and wiring (source checks)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("the member prompt says a member price exists and a masked name, never an amount or a level", () => {
    const box = read("components/booking/DiscountBox.tsx");
    expect(box).toContain("Member price available.");
    const prompt = box.slice(box.indexOf('data-testid="member-prompt"'), box.indexOf("{result?.level &&"));
    expect(prompt).not.toMatch(/formatMoney|feeMinor|label|₹|Rs\b/);
  });
  it("the preview gives an unverified visitor only the masked hint, under its own stricter rate limit", () => {
    const src = read("app/api/coupons/preview/route.ts");
    expect(src).toContain("memberHintFor");
    expect(src).toMatch(/member-hint:\$\{clientIp\(req\)\}/);
    expect(src).toMatch(/if \(!verifiedBooker && r\.value\.level/);
  });
  it("the sign-in link route answers the same whoever the address is, and is rate limited per IP and per address", () => {
    const src = read("app/api/customer/member-link/route.ts");
    expect((src.match(/NextResponse\.json\(\{ sent: true \}\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("member-link:ip:");
    expect(src).toContain("member-link:email:");
  });
  it("the open route builds its destination from a business that exists (no open redirect) and sets the device cookie", () => {
    const src = read("app/api/customer/member-link/open/route.ts");
    expect(src).toContain("publicSiteUrl(business.slug");
    expect(src).not.toMatch(/searchParams\.get\("(next|redirect|return|url)/);
    expect(src).toContain("setDeviceCookie(r.customerId)");
  });
  it("the device cookie is httpOnly, signed, and only set after a verified booking", () => {
    expect(read("lib/verifiedDevice.ts")).toMatch(/httpOnly: true/);
    const route = read("app/api/bookings/route.ts");
    expect(route).toMatch(/const id = await verifiedCustomerId\([\s\S]*if \(id\) await setDeviceCookie\(id\)/);
    expect(route).toContain("await readDeviceTicket()");
  });
  it("Google goes through the same book-again ticket, built from an existing business", () => {
    const src = read("app/account/member/page.tsx");
    expect(src).toContain("/api/customer/book-again?");
    expect(src).toMatch(/if \(!business\) redirect/);
  });
});
