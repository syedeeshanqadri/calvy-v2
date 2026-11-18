// Step 29: calendar invites (update + cancel), private calendar feeds, and the cleaner public routes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { icsAttachment, icsSequence, ICS_EPOCH_MS } from "@/lib/notifications/ics";
import { cancellation, confirmation, noticeFrom, reschedule, type Notice } from "@/lib/notifications/events";
import { TEMPLATES } from "@/lib/notifications/templates";
import { buildFeed, feedLinks, fold, newCalendarToken, parseCalendarToken } from "@/lib/calendarFeed";
import { RESERVED_SLUGS } from "@/lib/slugs";
import { templateUrlBases } from "@/lib/whatsapp/urls";

const decode = (a: { content: string }) => Buffer.from(a.content, "base64").toString("utf8");
const start = new Date("2026-11-20T10:00:00Z");
const d = { appointmentId: "appt12345", serviceName: "Checkup", businessName: "Sunrise", staffName: "Dr Rao", durationMinutes: 30, start };

describe("ICS invites", () => {
  it("the first invite is METHOD:REQUEST, SEQUENCE 0, with a reminder", () => {
    const a = icsAttachment(d);
    const t = decode(a);
    expect(t).toContain("METHOD:REQUEST");
    expect(t).toContain("SEQUENCE:0");
    expect(t).toContain("STATUS:CONFIRMED");
    expect(t).toContain("BEGIN:VALARM");
    expect(a.contentType).toContain("method=REQUEST");
  });
  it("an update keeps the UID, raises SEQUENCE, carries a DTSTAMP and the new start", () => {
    const first = decode(icsAttachment(d));
    const later = new Date("2026-11-18T09:00:00Z");
    const moved = decode(icsAttachment({ ...d, start: new Date("2026-11-21T11:30:00Z"), sequence: icsSequence(later) }));
    const uid = (s: string) => /UID:(.+)\r/.exec(s)![1];
    expect(uid(moved)).toBe(uid(first));
    expect(Number(/SEQUENCE:(\d+)/.exec(moved)![1])).toBeGreaterThan(0);
    expect(moved).toContain("DTSTART:20261121T113000Z");
    expect(moved).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
  it("a cancellation is METHOD:CANCEL, STATUS:CANCELLED, no reminder", () => {
    const a = icsAttachment({ ...d, sequence: icsSequence(new Date("2026-11-19T00:00:00Z")), cancel: true });
    const t = decode(a);
    expect(t).toContain("METHOD:CANCEL");
    expect(t).toContain("STATUS:CANCELLED");
    expect(t).not.toContain("VALARM");
    expect(a.contentType).toContain("method=CANCEL");
  });
  it("same input = same bytes (a retried email must be identical), and sequences only go up", () => {
    const seq = icsSequence(new Date(ICS_EPOCH_MS + 5000));
    expect(icsAttachment({ ...d, sequence: seq }).content).toBe(icsAttachment({ ...d, sequence: seq }).content);
    expect(icsSequence(new Date("2026-11-19T10:00:01Z"))).toBeGreaterThan(icsSequence(new Date("2026-11-19T10:00:00Z")));
    expect(icsSequence(new Date("2020-01-01"))).toBe(1);
  });
});

const notice = (over: Partial<Notice> = {}): Notice => ({
  appointmentId: "appt12345", businessId: "b1", to: "riya@example.com", startsAt: start.toISOString(),
  payload: { clientName: "Riya", businessName: "Sunrise", serviceName: "Checkup", staffName: "Dr Rao", date: "Fri, 20 Nov", time: "3:30 PM", duration: 30, price: 0, currency: "INR" },
  ...over,
});
const attachmentsOf = (template: "confirmation" | "reschedule" | "cancellation", payload: unknown) =>
  (TEMPLATES[template] as unknown as { attachments?: (p: unknown) => { content: string; contentType: string }[] | undefined }).attachments?.(payload);

describe("update and cancel invites are queued with the notification", () => {
  it("confirmation: invite at sequence 0 (unchanged)", () => {
    const n = confirmation(notice(), start)!;
    const [a] = attachmentsOf("confirmation", n.payload)!;
    expect(decode(a)).toContain("SEQUENCE:0");
  });
  it("reschedule: updated invite at the NEW start, same UID as the confirmation", () => {
    const to = new Date("2026-11-22T05:00:00Z");
    const now = new Date("2026-11-18T10:00:00Z");
    const n = reschedule(notice(), { from: start, to, oldDate: "Fri, 20 Nov", oldTime: "3:30 PM" }, now)!;
    const [a] = attachmentsOf("reschedule", n.payload)!;
    const t = decode(a);
    expect(t).toContain("DTSTART:20261122T050000Z");
    expect(t).toContain("METHOD:REQUEST");
    expect(Number(/SEQUENCE:(\d+)/.exec(t)![1])).toBe(icsSequence(now));
    const [c] = attachmentsOf("confirmation", confirmation(notice(), start)!.payload)!;
    expect(/UID:(.+)\r/.exec(t)![1]).toBe(/UID:(.+)\r/.exec(decode(c))![1]);
  });
  it("cancellation: METHOD:CANCEL at the booking's start, sequence above any earlier update", () => {
    const resched = reschedule(notice(), { from: start, to: start, oldDate: "x", oldTime: "y" }, new Date("2026-11-18T10:00:00Z"))!;
    const cancel = cancellation(notice(), "https://calvy.io/sunrise", new Date("2026-11-18T10:05:00Z"))!;
    const seq = (p: unknown, tpl: "reschedule" | "cancellation") => Number(/SEQUENCE:(\d+)/.exec(decode(attachmentsOf(tpl, p)![0]))![1]);
    expect(decode(attachmentsOf("cancellation", cancel.payload)![0])).toContain("METHOD:CANCEL");
    expect(seq(cancel.payload, "cancellation")).toBeGreaterThan(seq(resched.payload, "reschedule"));
  });
  it("cancellation without a known start sends no invite; no email address sends nothing", () => {
    expect(attachmentsOf("cancellation", cancellation(notice({ startsAt: undefined }))!.payload)).toBeUndefined();
    expect(cancellation(notice({ to: null }))).toBeNull();
  });
  it("noticeFrom carries the start the calendar entry sits at", () => {
    const n = noticeFrom({
      id: "a1", businessId: "b1", date: start, duration: 30, price: 0, notes: null, patientName: null, tokenNumber: null, estimatedAt: null, isOnline: false, meetingUrl: null,
      client: { name: "Riya", email: "r@x.co", phone: null, whatsappConsent: false }, service: { name: "Checkup" }, staff: null, tokenSession: null,
      business: { name: "Sunrise", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null },
    } as never);
    expect(n.startsAt).toBe(start.toISOString());
  });
});

describe("calendar feed format", () => {
  it("tokens: 64 hex, parsed with or without .ics, anything else rejected", () => {
    const t = newCalendarToken();
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    expect(parseCalendarToken(t)).toBe(t);
    expect(parseCalendarToken(`${t}.ics`)).toBe(t);
    for (const bad of ["", "abc", `${t}x`, t.toUpperCase(), `../${t}`, `${t}.txt`]) expect(parseCalendarToken(bad), bad).toBeNull();
  });
  it("folds long lines at 75 octets and never splits a multi-byte character", () => {
    const long = "SUMMARY:" + "é".repeat(80);
    const out = fold(long);
    for (const line of out.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(out.replace(/\r\n /g, "")).toBe(long);
  });
  it("builds a PUBLISH calendar; cancelled bookings are STATUS:CANCELLED; text is escaped", () => {
    const ics = buildFeed("Sunrise, bookings", [
      { id: "a1", start, durationMinutes: 30, summary: "Checkup: Riya; K", cancelled: false, modified: start },
      { id: "a2", start, durationMinutes: 30, summary: "Facial: Aman", cancelled: true, modified: start },
    ]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Sunrise\\, bookings");
    expect(ics).toContain("SUMMARY:Checkup: Riya\; K");
    expect(ics).toContain("UID:a1@calvy.io");
    expect(ics.match(/STATUS:CANCELLED/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
  it("one-click links for Google, Outlook and Apple", () => {
    const l = feedLinks("https://calvy.io/api/calendar/abc.ics", "Sunrise");
    expect(l.webcal).toBe("webcal://calvy.io/api/calendar/abc.ics");
    expect(l.google).toContain("calendar.google.com");
    expect(l.google).toContain(encodeURIComponent("webcal://calvy.io/api/calendar/abc.ics"));
    expect(l.outlook).toContain("outlook.live.com");
  });
});

// ---- the feed route and the owner's settings route ----
const h = vi.hoisted(() => ({
  session: vi.fn(),
  db: {
    business: { findUnique: vi.fn(), update: vi.fn() },
    staff: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/lib/access", () => ({ accessSession: h.session }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 0 }), clientIp: () => "1.1.1.1" }));

const TOKEN = "a".repeat(64);
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const row = { id: "a1", date: start, estimatedAt: null, duration: 30, status: "confirmed", notes: null, updatedAt: start, tokenNumber: null, client: { name: "Riya" }, service: { name: "Checkup" }, staff: { name: "Dr Rao" } };

describe("GET /api/calendar/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.business.findUnique.mockResolvedValue(null);
    h.db.staff.findUnique.mockResolvedValue(null);
    h.db.appointment.findMany.mockResolvedValue([row]);
  });
  it("a malformed token is a 404 and never touches the database", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route");
    expect((await GET(new NextRequest("http://x/api/calendar/nope"), ctx("nope"))).status).toBe(404);
    expect(h.db.business.findUnique).not.toHaveBeenCalled();
  });
  it("an unknown (or regenerated) token is a 404", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route");
    expect((await GET(new NextRequest("http://x"), ctx(`${TOKEN}.ics`))).status).toBe(404);
  });
  it("a business token returns that business's bookings as text/calendar, private and uncached", async () => {
    h.db.business.findUnique.mockResolvedValue({ id: "b1", name: "Sunrise", suspendedAt: null });
    const { GET } = await import("@/app/api/calendar/[token]/route");
    const res = await GET(new NextRequest("http://x"), ctx(`${TOKEN}.ics`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toContain("SUMMARY:Checkup: Riya");
    const where = h.db.appointment.findMany.mock.calls[0][0].where;
    expect(where.businessId).toBe("b1");
    expect(where.staffId).toBeUndefined();
  });
  it("a staff token is limited to that person's bookings", async () => {
    h.db.staff.findUnique.mockResolvedValue({ id: "s1", name: "Dr Rao", businessId: "b1", business: { name: "Sunrise", suspendedAt: null } });
    const { GET } = await import("@/app/api/calendar/[token]/route");
    expect((await GET(new NextRequest("http://x"), ctx(TOKEN))).status).toBe(200);
    expect(h.db.appointment.findMany.mock.calls[0][0].where).toMatchObject({ businessId: "b1", staffId: "s1" });
  });
  it("a suspended business publishes nothing", async () => {
    h.db.business.findUnique.mockResolvedValue({ id: "b1", name: "Sunrise", suspendedAt: new Date() });
    const { GET } = await import("@/app/api/calendar/[token]/route");
    expect((await GET(new NextRequest("http://x"), ctx(TOKEN))).status).toBe(404);
    expect(h.db.appointment.findMany).not.toHaveBeenCalled();
  });
});

describe("/api/settings/calendar (owner only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.session.mockResolvedValue({ user: { id: "u1", businessId: "b1" } });
    h.db.business.findUnique.mockResolvedValue({ id: "b1", name: "Sunrise", calendarToken: TOKEN });
    h.db.staff.findMany.mockResolvedValue([{ id: "s1", name: "Dr Rao", calendarToken: null }]);
    h.db.staff.update.mockResolvedValue({});
  });
  const post = (body: unknown) => new NextRequest("http://x/api/settings/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  it("401 without a session", async () => {
    h.session.mockResolvedValue(null);
    const { GET, POST } = await import("@/app/api/settings/calendar/route");
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ target: "business" }))).status).toBe(401);
  });
  it("lists the business feed and one per staff member, creating missing tokens (scoped to the business)", async () => {
    const { GET } = await import("@/app/api/settings/calendar/route");
    const body = await (await GET()).json();
    expect(body.feeds.map((f: { target: string }) => f.target)).toEqual(["business", "s1"]);
    expect(body.feeds[0].url).toMatch(new RegExp(`/api/calendar/${TOKEN}\\.ics$`));
    expect(h.db.staff.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1", businessId: "b1" } }));
  });
  it("regenerating the business feed writes a new token", async () => {
    const { POST } = await import("@/app/api/settings/calendar/route");
    expect((await POST(post({ target: "business" }))).status).toBe(200);
    const data = h.db.business.update.mock.calls[0][0].data;
    expect(data.calendarToken).toMatch(/^[a-f0-9]{64}$/);
    expect(data.calendarToken).not.toBe(TOKEN);
  });
  it("regenerating another business's staff feed is a 404 (scoped by businessId)", async () => {
    h.db.staff.updateMany.mockResolvedValue({ count: 0 });
    const { POST } = await import("@/app/api/settings/calendar/route");
    expect((await POST(post({ target: "staff-of-biz-B" }))).status).toBe(404);
    expect(h.db.staff.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "staff-of-biz-B", businessId: "b1" } }));
  });
});

// ---- routes ----
describe("public routes", () => {
  it("old folders are gone, new ones exist", () => {
    for (const gone of ["app/b", "app/my", "app/[slug]/q"]) expect(existsSync(gone), gone).toBe(false);
    for (const here of ["app/account/login/page.tsx", "app/account/(app)/page.tsx", "app/booking/[code]/page.tsx", "app/booking/return/page.tsx", "app/[slug]/book/page.tsx", "app/[slug]/book-now/page.tsx"]) {
      expect(existsSync(here), here).toBe(true);
    }
  });
  it("/book-now is an alias of /book (same page, canonical points at /book)", () => {
    expect(readFileSync("app/[slug]/book-now/page.tsx", "utf8")).toContain('from "../book/page"');
    expect(readFileSync("app/[slug]/book/page.tsx", "utf8")).toContain("canonical: `/${business.slug}/book`");
  });
  it("301 redirects for every old address", async () => {
    const { LEGACY_REDIRECTS } = await import("../next.config.mjs");
    const byFrom = Object.fromEntries(LEGACY_REDIRECTS.map((r: { source: string; destination: string; statusCode?: number }) => [r.source, r]));
    expect(byFrom["/b/:slug"].destination).toBe("/:slug/book");
    expect(byFrom["/my"].destination).toBe("/account");
    expect(byFrom["/my/:path*"].destination).toBe("/account/:path*");
    expect(byFrom["/:slug/q/:code"].destination).toBe("/booking/:code");
    expect(byFrom["/q/:code"].destination).toBe("/booking/:code");
    for (const r of LEGACY_REDIRECTS) expect(r.statusCode, r.source).toBe(301);
  });
  it("reserved slugs cover the new top-level words", () => {
    for (const s of ["account", "book", "booking", "b", "my"]) expect(RESERVED_SLUGS.has(s), s).toBe(true);
  });
  it("WhatsApp template buttons point at /booking/{code}", () => {
    expect(templateUrlBases("any-shop", { NEXT_PUBLIC_APP_URL: "https://calvy.io" } as unknown as NodeJS.ProcessEnv).tracking).toBe("https://calvy.io/booking/");
  });
  it("root domain defaults to calvy.io", () => {
    expect(readFileSync("proxy.ts", "utf8")).toContain('?? "calvy.io"');
  });
});
