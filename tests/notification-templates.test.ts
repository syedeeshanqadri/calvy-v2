import { describe, it, expect } from "vitest";
import { TEMPLATES, renderTemplate, type TemplateId } from "@/lib/notifications/templates";
import { icsAttachment } from "@/lib/notifications/ics";

const booking = {
  clientName: "Riya Kapoor", patientName: "Aarav Kapoor", businessName: "Sunrise", serviceName: "Checkup", staffName: "Dr Rao",
  date: "Mon, 2 Nov", time: "10:00 AM", duration: 30, price: 500, currency: "INR",
};
const SECRET = "https://x.test/reset?token=s3cret";
const alert = { kind: "created", clientName: "Riya Kapoor", serviceName: "Checkup", date: "Mon, 2 Nov", time: "10:00 AM", dashboardUrl: "https://x.test/dashboard" };

const FIXTURES: Record<TemplateId, object> = {
  confirmation: { ...booking, ics: { appointmentId: "a1", start: "2026-11-02T04:30:00.000Z", durationMinutes: 30 } },
  reminder: booking,
  reschedule: { ...booking, oldDate: "Sun, 1 Nov", oldTime: "9:00 AM" },
  cancellation: { ...booking, rebookUrl: "https://x.test/sunrise" },
  meeting_link: { ...booking, meetingUrl: "https://meet.test/abc", updated: false },
  queue_moved_back: { ...booking, place: 3 },
  queue_closed: { ...booking, reason: "missed", creditLabel: "₹500" },
  invoice: { ...booking, invoiceNumber: "INV-1", clientEmail: "r@x.test" },
  status_change: { ...booking, status: "completed" },
  review_request: { clientName: "Riya Kapoor", businessName: "Sunrise", reviewUrl: "https://g.page/r/abc/review" },
  welcome: { name: "Asha Rao", dashboardUrl: "https://x.test/dashboard" },
  business_live: { name: "Asha Rao", businessName: "Sunrise", websiteUrl: "https://sunrise.x.test" },
  business_alert: alert,
  daily_summary: {
    businessName: "Sunrise", dateLabel: "Mon, 2 Nov", counts: { bookings: 4, cancelled: 1, noShows: 0, completed: 2 }, paidTotal: 900, currency: "INR",
    upcoming: [{ time: "2:00 PM", clientName: "Riya Kapoor", serviceName: "Checkup" }], dashboardUrl: "https://x.test/dashboard",
  },
  verification: { name: "Asha Rao", secret: SECRET },
  password_reset: { name: "Asha Rao", secret: SECRET },
  customer_verification: { name: "Riya Kapoor", secret: SECRET },
  customer_password_reset: { name: "Riya Kapoor", secret: SECRET },
  customer_account_setup: { name: "Riya Kapoor", secret: SECRET },
  lead: { name: "Asha Rao", demoRequested: true },
  form_notification: { title: "New lead", fields: { Name: "Jo" }, at: "then" },
};
const ids = Object.keys(TEMPLATES) as TemplateId[];
const tenant = { name: "Sunrise", color: "#0f766e", fg: "#ffffff" };
const NO_TENANT = new Set<TemplateId>(["verification", "password_reset", "customer_verification", "customer_password_reset", "customer_account_setup", "lead", "form_notification"]);

describe("every template", () => {
  it("has a fixture", () => expect(Object.keys(FIXTURES).sort()).toEqual([...ids].sort()));

  for (const id of ids) {
    it(`${id}: renders subject, html and text, with no markup or undefined in the text`, async () => {
      const r = await renderTemplate(id, FIXTURES[id], { tenant, terms: { packId: "CLINIC" } });
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.html).toContain("<");
      expect(r.text.length).toBeGreaterThan(0);
      for (const s of [r.subject, r.text]) {
        expect(s).not.toMatch(/undefined|null|\[object|<[a-z]/);
        expect(s.toLowerCase()).not.toContain("tomorrow");
      }
    });
    if (!NO_TENANT.has(id)) {
      it(`${id}: carries the business's colour`, async () => {
        expect((await renderTemplate(id, FIXTURES[id], { tenant })).html).toContain("#0f766e");
      });
    }
    it(`${id}: renders without a brand too`, async () => {
      await expect(renderTemplate(id, FIXTURES[id])).resolves.toBeTruthy();
    });
  }

  it("an unknown or inherited template name is refused", async () => {
    await expect(renderTemplate("nope", {})).rejects.toThrow("Unknown notification template");
    await expect(renderTemplate("constructor", {})).rejects.toThrow("Unknown notification template");
  });
});

describe("pack wording", () => {
  const packs = [["LAWYER", "meeting", "Consultation"], ["FITNESS", "booking", "Session"], ["CONSULTANT", "session", "Consultation"]];
  for (const [packId, appt, svc] of packs) {
    it(`${packId}: subject and text say ${appt} and ${svc}`, async () => {
      const r = await renderTemplate("cancellation", booking, { terms: { packId } });
      expect(r.subject).toContain(`Your ${appt} at Sunrise`);
      expect(r.text).toContain(`this ${appt} at Sunrise`);
      expect(r.text).toContain(`${svc}: Checkup`);
    });
  }
  it("a business's own override wins", async () => {
    const r = await renderTemplate("business_alert", alert, { terms: { packId: "CLINIC", termsOverride: { appointment: { singular: "visit" } } } });
    expect(r.subject).toBe("New visit: Riya Kapoor");
  });
});

describe("content", () => {
  it("the reminder names the date instead of saying tomorrow", async () => {
    const r = await renderTemplate("reminder", booking);
    expect(r.subject).toBe("Reminder: Checkup on Mon, 2 Nov at 10:00 AM");
    expect(r.html.toLowerCase()).not.toContain("tomorrow");
  });
  it("token bookings show the number, estimate and tracking link in the text", async () => {
    const r = await renderTemplate("confirmation", { ...booking, token: { number: 7, estimatedTime: "10:40 AM", sessionName: "Morning" }, trackUrl: "https://x.test/q/1" });
    expect(r.subject).toContain("#7");
    expect(r.text).toContain("Queue number: #7");
    expect(r.text).toContain("https://x.test/q/1");
  });
  it("the joining link appears in the booker's text when set, and a promise when not", async () => {
    const withLink = await renderTemplate("reminder", { ...booking, online: { meetingUrl: "https://meet.test/abc" } });
    expect(withLink.text).toContain("Join online: https://meet.test/abc");
    const without = await renderTemplate("reminder", { ...booking, online: { meetingUrl: null } });
    expect(without.text).toContain("will send you the joining link");
  });
  it("the alert to the business never carries a joining link", async () => {
    const r = await renderTemplate("business_alert", { ...alert, online: { meetingUrl: "https://meet.test/abc" } });
    expect(r.html + r.text).not.toContain("meet.test");
  });
  it("the alert says who cancelled, and shows the old time when moved", async () => {
    expect((await renderTemplate("business_alert", { ...alert, kind: "cancelled", byCustomer: true })).subject).toBe("Appointment cancelled by the customer: Riya Kapoor");
    const moved = await renderTemplate("business_alert", { ...alert, kind: "rescheduled", oldDate: "Sun, 1 Nov", oldTime: "9:00 AM" });
    expect(moved.text).toContain("Was: Sun, 1 Nov, 9:00 AM");
    expect(moved.text).toContain("Now: Mon, 2 Nov, 10:00 AM");
  });
  it("owner emails use Calvy's footer, customer emails the business's", async () => {
    expect((await renderTemplate("business_alert", alert, { tenant })).html).toContain("Help Center");
    expect((await renderTemplate("reminder", booking, { tenant })).html).toContain("Grab it on Calvy");
  });
  it("the review request links only to the business's review page", async () => {
    const r = await renderTemplate("review_request", FIXTURES.review_request);
    expect(r.html).toContain("https://g.page/r/abc/review");
    expect(r.html).toContain("Review us on Google");
  });
  it("the same input renders the same message, so a retry keeps its idempotency key valid", async () => {
    const [a, b] = await Promise.all([renderTemplate("confirmation", FIXTURES.confirmation), renderTemplate("confirmation", FIXTURES.confirmation)]);
    expect(a).toEqual(b);
  });
});

describe("calendar invite", () => {
  const details = { appointmentId: "a1", serviceName: "Checkup", businessName: "Sunrise", durationMinutes: 30, start: new Date("2026-11-02T04:30:00Z") };
  const decode = (d: Parameters<typeof icsAttachment>[0]) => Buffer.from(icsAttachment(d).content, "base64").toString("utf8");

  it("the UID belongs to the appointment and survives a change of time", () => {
    expect(decode(details)).toContain("UID:a1@calvy.io");
    expect(decode({ ...details, start: new Date("2026-11-03T04:30:00Z") })).toContain("UID:a1@calvy.io");
    expect(decode({ ...details, appointmentId: "a2" })).toContain("UID:a2@calvy.io");
  });
  it("without an appointment id the UID is still stable", () => {
    const { appointmentId: _, ...rest } = details;
    expect(icsAttachment(rest)).toEqual(icsAttachment(rest));
    expect(decode(rest)).toMatch(/UID:[0-9a-f]{32}@calvy\.io/);
  });
  it("a name cannot add a field or break a line", () => {
    const text = decode({ ...details, businessName: "Acme, Inc;\r\nATTENDEE:evil@x.test" });
    expect(text).toContain("Acme\\, Inc\\;\\nATTENDEE:evil@x.test");
    expect(text.split("\r\n").some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });
  it("a name cannot change the organizer's address or close the quoted value", () => {
    const organizer = (businessName: string) => decode({ ...details, businessName }).split("\r\n").find((l) => l.startsWith("ORGANIZER"));
    expect(organizer("Acme:mailto:evil@x.test;X=1")).toBe('ORGANIZER;CN="Acme:mailto:evil@x.test;X=1":mailto:noreply@calvy.io');
    expect(organizer('Acme":mailto:evil@x.test')).toBe('ORGANIZER;CN="Acme:mailto:evil@x.test":mailto:noreply@calvy.io');
  });
  it("a bare carriage return or other control character cannot start a new line", () => {
    const text = decode({ ...details, businessName: "Acme\rATTENDEE:evil@x.test\u0007" });
    expect(text).toContain("SUMMARY:Checkup at Acme\\nATTENDEE:evil@x.test\r\n");
    expect(text).toContain('CN="AcmeATTENDEE:evil@x.test":mailto:');
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n\u0007]/);
  });
  it("the confirmation attaches it; other templates do not", async () => {
    const r = await renderTemplate("confirmation", FIXTURES.confirmation);
    expect(r.attachments?.[0].filename).toBe("appointment.ics");
    expect(Buffer.from(r.attachments![0].content, "base64").toString("utf8")).toContain("DTSTART:20261102T043000Z");
    expect((await renderTemplate("reminder", booking)).attachments).toBeUndefined();
  });
});
