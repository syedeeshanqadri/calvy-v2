import { readdirSync, readFileSync } from "fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// step-3/customer-events: every customer event is queued exactly once, respects the business's switches and the
// recipient's unsubscribe, and optional mail carries the unsubscribe link. Fake outbox with a unique key, like the DB.

const fake = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = { rows: [] as Row[], optouts: [] as { businessId: string; recipient: string }[], prefs: {} as Record<string, unknown> };
  const f = {
    state,
    $queryRaw: vi.fn(async (..._a: unknown[]): Promise<Row[]> => []),
    whatsAppConfig: { findUnique: async () => null, findMany: async () => [] },
    business: {
      findMany: vi.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, notificationPrefs: state.prefs[id] ?? null }))),
      findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: "Sunrise", logoUrl: null, primaryColor: "#0f766e", address: null, phone: null, packId: "CLINIC", termsOverride: null })),
    },
    notificationOptOut: {
      findMany: vi.fn(async ({ where }: any) => state.optouts.filter((o) => where.businessId.in.includes(o.businessId) && where.recipient.in.includes(o.recipient))),
    },
    notificationOutbox: {
      createMany: vi.fn(async ({ data }: any) => {
        let count = 0;
        for (const d of data) {
          if (state.rows.some((r) => r.idempotencyKey === d.idempotencyKey)) continue;
          state.rows.push({ id: `n${state.rows.length + 1}`, status: "PENDING", attempts: 1, expiresAt: null, ...d });
          count++;
        }
        return { count };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        state.rows.filter((r) => where.idempotencyKey.in.includes(r.idempotencyKey) && (!where.status || r.status === where.status)).map((r) => ({ id: r.id }))),
      updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
  };
  return f;
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));

import { enqueue } from "@/lib/notifications/enqueue";
import {
  authEmail, cancellation, confirmation, leadAcknowledgment, meetingLink, noticeFrom, queueClosed, queueMovedBack, receipt, reschedule, statusChange,
  type BookingSource,
} from "@/lib/notifications/events";
import { OPTIONAL_EVENTS, isValidUnsubscribe, resolvePrefs, skipReasons, unsubscribeLinks } from "@/lib/notifications/prefs";
import { parseUnsubscribeParams } from "@/lib/notifications/unsubscribe";
import { runOutbox } from "@/lib/notifications/process";
import { renderTemplate } from "@/lib/notifications/templates";
import { decryptSecret } from "@/lib/notifications/secret";
import type { Channel } from "@/lib/notifications/channels";

const src: BookingSource = {
  id: "cmgx1ab2c0000xyz1234", businessId: "biz1", date: new Date("2026-11-02T04:30:00Z"), duration: 30, price: 500, notes: null, patientName: null, isOnline: false,
  client: { name: "Riya Kapoor", email: "Riya@Example.com" },
  service: { name: "Checkup" }, staff: { name: "Dr Rao" },
  business: { name: "Sunrise", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null },
};
const notice = noticeFrom(src);
const later = new Date(src.date.getTime() + 3_600_000);

/** Every customer event, as the callers fire it. */
const EVENTS = {
  "booking.created": () => confirmation(notice, src.date),
  "booking.rescheduled": () => reschedule(notice, { from: src.date, to: later, oldDate: "Mon, 2 Nov", oldTime: "10:00 AM" }),
  "booking.cancelled": () => cancellation(notice, "https://calvy.io/sunrise"),
  "booking.meeting_link": () => meetingLink(notice, "https://meet.example/a", false),
  "booking.paid": () => receipt(notice),
  "booking.completed": () => statusChange(notice, "completed", "https://calvy.io/sunrise"),
  "booking.no_show": () => statusChange(notice, "no_show", "https://calvy.io/sunrise"),
  "booking.queue_moved_back": () => queueMovedBack(notice, 3, 1),
  "booking.queue_closed": () => queueClosed(notice, { reason: "missed", creditLabel: "₹500" }),
} as const;
const names = Object.keys(EVENTS) as (keyof typeof EVENTS)[];
const TRANSACTIONAL = names.filter((n) => !OPTIONAL_EVENTS.has(n));

const db = fake as never;
const noPause = async () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NOTIFY_SECRET_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://calvy.io"); // CI sets it to localhost
  fake.state.rows.length = 0;
  fake.state.optouts.length = 0;
  fake.state.prefs = {};
  fake.$queryRaw.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("each customer event is queued exactly once", () => {
  it.each(names)("%s: firing twice (retry, double click) is one row", async (name) => {
    const first = await enqueue(db, [EVENTS[name]()!]);
    const again = await enqueue(db, [EVENTS[name]()!]);
    expect(fake.state.rows).toHaveLength(1);
    expect(again).toEqual(first);
    expect(fake.state.rows[0]).toMatchObject({
      event: name, audience: "CUSTOMER", channel: "EMAIL", recipient: "riya@example.com", businessId: "biz1", appointmentId: src.id, status: "PENDING",
    });
  });

  it.each(names)("%s: the stored payload renders its template with the business's wording", async (name) => {
    await enqueue(db, [EVENTS[name]()!]);
    const row = fake.state.rows[0];
    const out = await renderTemplate(row.template, row.payload, { terms: { packId: "CLINIC" } });
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain("Sunrise");
    expect(out.text).not.toMatch(/undefined|null/);
  });

  it("the address case does not make a second row", async () => {
    await enqueue(db, [confirmation(notice, src.date)!]);
    await enqueue(db, [confirmation({ ...notice, to: "riya@EXAMPLE.com" }, src.date)!]);
    expect(fake.state.rows).toHaveLength(1);
  });

  it("every event has its own key, so nine events are nine rows", async () => {
    await enqueue(db, names.map((n) => EVENTS[n]()!));
    expect(fake.state.rows.map((r) => r.event).sort()).toEqual([...names].sort());
  });

  it("a move is one email; a different move is another", async () => {
    const move = (from: number, to: number) => reschedule(notice, { from: new Date(from), to: new Date(to), oldDate: "d", oldTime: "t" })!;
    await enqueue(db, [move(1000, 2000)]);
    await enqueue(db, [move(1000, 2000)]);
    expect(fake.state.rows).toHaveLength(1);
    await enqueue(db, [move(2000, 3000)]);
    expect(fake.state.rows).toHaveLength(2);
  });

  it("changing the joining link tells the customer again; saving the same link does not", async () => {
    await enqueue(db, [meetingLink(notice, "https://meet.example/a", false)!]);
    await enqueue(db, [meetingLink(notice, "https://meet.example/a", false)!]);
    await enqueue(db, [meetingLink(notice, "https://meet.example/b", true)!]);
    expect(fake.state.rows).toHaveLength(2);
  });

  it("each missed call in the queue is told, but not twice", async () => {
    for (const misses of [1, 1, 2, 2, 3]) await enqueue(db, [queueMovedBack(notice, 4, misses)!]);
    expect(fake.state.rows).toHaveLength(3);
  });

  it("two online payments for one booking get a receipt each; one payment gets one", async () => {
    await enqueue(db, [receipt(notice, { version: "pay1" })!]);
    await enqueue(db, [receipt(notice, { version: "pay1" })!]);
    await enqueue(db, [receipt(notice, { version: "pay2" })!]);
    expect(fake.state.rows).toHaveLength(2);
  });

  it("the receipt shows what was paid and the booking's own invoice number", async () => {
    const r = receipt(notice, { price: 50, serviceName: "Checkup (online payment)", paymentRef: "cf_123" })!;
    expect(r.payload).toMatchObject({ price: 50, serviceName: "Checkup (online payment)", paymentRef: "cf_123", invoiceNumber: "INV-XYZ1234".replace("XYZ1234", src.id.slice(-8).toUpperCase()), clientEmail: "Riya@Example.com" });
  });

  it("a booking with no email address queues nothing", () => {
    const none = { ...notice, to: null };
    for (const build of [() => confirmation(none, src.date), () => cancellation(none), () => receipt(none), () => statusChange(none, "completed"), () => queueClosed(none, { reason: "cancelled" })]) {
      expect(build()).toBeNull();
    }
  });

  it("pack wording, multi-service names and the token follow the booking", () => {
    const n = noticeFrom({ ...src, notes: "__services__:X-ray|Blood test", tokenNumber: 7, tokenSession: { name: "Morning" }, estimatedAt: new Date("2026-11-02T05:10:00Z"), isOnline: true, meetingUrl: "https://meet.example/a" });
    expect(n.payload).toMatchObject({
      serviceName: "Checkup & X-ray & Blood test", staffName: "Dr Rao", currency: "INR",
      token: { number: 7, sessionName: "Morning", estimatedTime: "10:40 AM" }, online: { meetingUrl: "https://meet.example/a" },
    });
    expect(noticeFrom({ ...src, staff: null }).payload.staffName).toBe("Your doctor");
  });
});

describe("account and marketing emails", () => {
  const verify = (token: string) => authEmail({ template: "verification", userId: "u1", to: "A@x.co", name: "Asha Rao", token, baseUrl: "https://calvy.io/" });

  it("a new token is a new email; the same token is not", async () => {
    await enqueue(db, [verify("tok-1")]);
    await enqueue(db, [verify("tok-1")]);
    expect(fake.state.rows).toHaveLength(1);
    await enqueue(db, [verify("tok-2")]);
    expect(fake.state.rows).toHaveLength(2);
  });

  it("the link lives only in the encrypted secret, never in the key or the payload", async () => {
    await enqueue(db, [verify("tok-secret-1")]);
    const row = fake.state.rows[0];
    expect(JSON.stringify({ ...row, secret: null })).not.toContain("tok-secret-1");
    expect(row.secret).not.toContain("tok-secret-1");
    expect(decryptSecret(row.secret)).toBe("https://calvy.io/verify-email?token=tok-secret-1");
    expect(row).toMatchObject({ event: "auth.verify", audience: "BUSINESS", businessId: null, template: "verification", recipient: "a@x.co" });
  });

  it("customer accounts link to /my, owners to the owner pages", () => {
    const secrets = (["verification", "password_reset", "customer_verification", "customer_password_reset"] as const).map((template) => authEmail({ template, userId: "u", to: "a@x.co", name: "A", token: "t", baseUrl: "https://calvy.io" }).secret);
    expect(secrets).toEqual([
      "https://calvy.io/verify-email?token=t", "https://calvy.io/reset-password?token=t",
      "https://calvy.io/my/verify-email?token=t", "https://calvy.io/my/reset-password?token=t",
    ]);
  });

  it("the emailed link is in the rendered message", async () => {
    await enqueue(db, [authEmail({ template: "customer_password_reset", userId: "c1", to: "r@x.co", name: "Riya", token: "abc", baseUrl: "https://calvy.io" })]);
    const row = fake.state.rows[0];
    expect(row).toMatchObject({ event: "auth.reset", audience: "CUSTOMER" });
    const out = await renderTemplate(row.template, { ...row.payload, secret: decryptSecret(row.secret) });
    expect(out.html).toContain("https://calvy.io/my/reset-password?token=abc");
    expect(out.text).toContain("https://calvy.io/my/reset-password?token=abc");
  });

  it("a lead is acknowledged once", async () => {
    const lead = () => leadAcknowledgment({ leadId: "l1", to: "L@x.co", name: "Lee", demoRequested: true });
    await enqueue(db, [lead()]);
    await enqueue(db, [lead()]);
    expect(fake.state.rows).toHaveLength(1);
    expect(fake.state.rows[0]).toMatchObject({ event: "platform.lead", audience: "PLATFORM", template: "lead", businessId: null });
  });
});

describe("business switches", () => {
  it("defaults are on, and broken settings fall back to the defaults", () => {
    expect(resolvePrefs(null).customer.completed).toBe(true);
    expect(resolvePrefs({}).customer.completed).toBe(true);
    expect(resolvePrefs("nonsense").customer.completed).toBe(true);
    expect(resolvePrefs({ customer: { completed: "no" } }).customer.completed).toBe(true);
    expect(resolvePrefs({ customer: { completed: false } }).customer.completed).toBe(false);
  });

  it("with the thank-you switched off it is recorded as skipped, with the reason, and nothing is due", async () => {
    fake.state.prefs.biz1 = { customer: { completed: false } };
    const due = await enqueue(db, [EVENTS["booking.completed"]()!]);
    expect(due).toEqual([]);
    expect(fake.state.rows[0]).toMatchObject({ event: "booking.completed", status: "SKIPPED", error: "turned off by the business", secret: null });
  });

  it("the switch is the business's own: another business's setting does not apply", async () => {
    fake.state.prefs.other = { customer: { completed: false } };
    expect(await enqueue(db, [EVENTS["booking.completed"]()!])).toHaveLength(1);
  });

  it("no setting can switch off a transactional message", async () => {
    fake.state.prefs.biz1 = { customer: { completed: false }, alerts: { created: false, cancelled: false, paid: false }, reminders: false };
    const due = await enqueue(db, TRANSACTIONAL.map((n) => EVENTS[n]()!));
    expect(due).toHaveLength(TRANSACTIONAL.length);
    expect(fake.state.rows.every((r) => r.status === "PENDING")).toBe(true);
  });
});

describe("customer unsubscribe", () => {
  const optOut = (recipient = "riya@example.com", businessId = "biz1") => fake.state.optouts.push({ businessId, recipient });

  it("an unsubscribed customer gets no thank-you, whatever the address case", async () => {
    optOut();
    const due = await enqueue(db, [EVENTS["booking.completed"]()!]);
    expect(due).toEqual([]);
    expect(fake.state.rows[0]).toMatchObject({ status: "SKIPPED", error: "unsubscribed" });
  });

  it("but still gets every transactional message", async () => {
    optOut();
    const due = await enqueue(db, TRANSACTIONAL.map((n) => EVENTS[n]()!));
    expect(due).toHaveLength(TRANSACTIONAL.length);
  });

  it("unsubscribing from one business does not silence another, or another person", async () => {
    optOut("riya@example.com", "other-biz");
    optOut("someone@else.com", "biz1");
    expect(await enqueue(db, [EVENTS["booking.completed"]()!])).toHaveLength(1);
  });

  it("transactional-only batches cost no extra queries", async () => {
    await enqueue(db, TRANSACTIONAL.map((n) => EVENTS[n]()!));
    expect(fake.business.findMany).not.toHaveBeenCalled();
    expect(fake.notificationOptOut.findMany).not.toHaveBeenCalled();
  });

  it("asks the database once per kind of check, however many messages", async () => {
    const reasons = await skipReasons(db, [1, 2, 3].map((i) => ({ businessId: "biz1", event: "booking.completed", recipient: `p${i}@x.co` })));
    expect(reasons.size).toBe(0);
    expect(fake.business.findMany).toHaveBeenCalledTimes(1);
    expect(fake.notificationOptOut.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("the unsubscribe link", () => {
  it("is signed for one business and one address", () => {
    const { page } = unsubscribeLinks("biz1", "Riya@Example.com");
    const q = new URL(page).searchParams;
    expect(isValidUnsubscribe("biz1", "riya@example.com", q.get("s")!)).toBe(true);
    expect(isValidUnsubscribe("biz2", "riya@example.com", q.get("s")!)).toBe(false);
    expect(isValidUnsubscribe("biz1", "other@example.com", q.get("s")!)).toBe(false);
    expect(isValidUnsubscribe("biz1", "riya@example.com", q.get("s")! + "x")).toBe(false);
  });

  it("round-trips through the parser and refuses anything altered", () => {
    const { page } = unsubscribeLinks("biz1", "Riya@Example.com");
    const q = new URL(page).searchParams;
    expect(parseUnsubscribeParams(q, isValidUnsubscribe)).toEqual({ businessId: "biz1", recipient: "riya@example.com" });
    const swapped = new URLSearchParams(q);
    swapped.set("e", Buffer.from("victim@example.com").toString("base64url"));
    expect(parseUnsubscribeParams(swapped, isValidUnsubscribe)).toBeNull();
    for (const bad of ["", "b=biz1", "b=biz1&e=!!&s=x", `b=${"x".repeat(80)}&e=YQ&s=x`]) expect(parseUnsubscribeParams(new URLSearchParams(bad), isValidUnsubscribe)).toBeNull();
  });

  it("only optional mail carries it: footer link, text line and one-click headers", async () => {
    const links = unsubscribeLinks("biz1", "riya@example.com");
    const optional = await renderTemplate("status_change", EVENTS["booking.completed"]()!.payload, { terms: { packId: "CLINIC" } }, links);
    expect(optional.html).toContain("Stop these emails");
    expect(optional.html).toContain(links.page.replace(/&/g, "&amp;"));
    expect(optional.text).toContain(links.page);
    expect(optional.headers).toEqual({ "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    const transactional = await renderTemplate("cancellation", EVENTS["booking.cancelled"]()!.payload, { terms: { packId: "CLINIC" } });
    expect(transactional.html).not.toContain("Stop these emails");
    expect(transactional.text).not.toContain("unsubscribe");
    expect(transactional.headers).toBeUndefined();
  });
});

describe("at send time", () => {
  const send = vi.fn<Channel>(async () => ({ kind: "sent" }));
  const channels = { EMAIL: send, WHATSAPP: send };
  /** Queue the event, then hand its row to the next scheduler run as if it had been claimed. */
  const claim = async (event: keyof typeof EVENTS) => {
    await enqueue(db, [EVENTS[event]()!]);
    fake.$queryRaw.mockResolvedValueOnce([fake.state.rows[0]]);
  };
  beforeEach(() => send.mockClear());

  it("optional mail goes out with the unsubscribe link and headers", async () => {
    await claim("booking.completed");
    const res = await runOutbox(channels, noPause);
    expect(res.sent).toBe(1);
    const [message, to] = send.mock.calls[0];
    expect(to).toBe("riya@example.com");
    expect(message.html).toContain("Stop these emails");
    expect(message.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/calvy\.io\/api\/unsubscribe\?b=biz1&e=.+&s=.+>$/);
  });

  it("someone who unsubscribed after it was queued is skipped, not sent", async () => {
    await claim("booking.completed");
    fake.state.optouts.push({ businessId: "biz1", recipient: "riya@example.com" });
    const res = await runOutbox(channels, noPause);
    expect(res).toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
    const write = fake.notificationOutbox.updateMany.mock.calls.map((c) => c[0] as { data: Record<string, unknown> }).find((a) => a.data.status === "SKIPPED");
    expect(write?.data).toMatchObject({ status: "SKIPPED", error: "unsubscribed", secret: null });
  });

  it("a switch turned off after it was queued is honoured too", async () => {
    await claim("booking.completed");
    fake.state.prefs.biz1 = { customer: { completed: false } };
    expect((await runOutbox(channels, noPause)).skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("transactional mail is sent even to an unsubscribed address, with no unsubscribe link", async () => {
    fake.state.optouts.push({ businessId: "biz1", recipient: "riya@example.com" });
    fake.state.prefs.biz1 = { customer: { completed: false } };
    await claim("booking.cancelled");
    expect((await runOutbox(channels, noPause)).sent).toBe(1);
    expect(send.mock.calls[0][0].html).not.toContain("Stop these emails");
    expect(send.mock.calls[0][0].headers).toBeUndefined();
  });
});

describe("email code is safe in the server bundle", () => {
  // Route handlers are built against the server React, which has no createContext or hooks. A module-level
  // createContext in emails/ broke the production build (not the unit tests) once already.
  const files = [
    ...readdirSync("emails").map((f) => `emails/${f}`),
    ...readdirSync("lib/notifications").map((f) => `lib/notifications/${f}`),
    "lib/email.tsx",
  ].filter((f) => /\.tsx?$/.test(f));
  it.each(files)("%s uses no React context or hooks", (file) => {
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // comments may name them
    expect(code).not.toMatch(/createContext|useContext|useState|useEffect|useRef|useMemo|useCallback|"use client"/);
  });
});
