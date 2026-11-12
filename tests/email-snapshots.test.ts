import { describe, it, expect } from "vitest";
import { TEMPLATES, renderTemplate, type TemplateId } from "@/lib/notifications/templates";

// chore/deps-maintenance: the exact subject, HTML and text of every email, branded and unbranded. Written before
// moving off the deprecated @react-email packages, so a dependency change that alters any email fails here.

const booking = {
  clientName: "Riya Kapoor", patientName: "Aarav Kapoor", businessName: "Sunrise", serviceName: "Checkup", staffName: "Dr Rao",
  date: "Mon, 2 Nov", time: "10:00 AM", duration: 30, price: 500, currency: "INR",
};
const SECRET = "https://x.test/reset?token=s3cret";

const FIXTURES: Record<TemplateId, object> = {
  confirmation: { ...booking, online: { meetingUrl: "https://meet.test/abc" } },
  reminder: { ...booking, token: { number: 7, estimatedTime: "10:40 AM", sessionName: "Morning OPD", sessionStart: "9:00 AM" }, trackUrl: "https://x.test/track/a1" },
  reschedule: { ...booking, oldDate: "Sun, 1 Nov", oldTime: "9:00 AM" },
  cancellation: { ...booking, rebookUrl: "https://x.test/sunrise" },
  meeting_link: { ...booking, meetingUrl: "https://meet.test/abc", updated: true },
  queue_moved_back: { ...booking, place: 3, trackUrl: "https://x.test/track/a1" },
  queue_next: { ...booking, ahead: 3, trackUrl: "https://x.test/track/a1" },
  queue_closed: { ...booking, reason: "missed", creditLabel: "₹500", loginUrl: "https://x.test/my" },
  invoice: { ...booking, invoiceNumber: "INV-1", clientEmail: "r@x.test", paymentRef: "pay_1" },
  status_change: { ...booking, status: "no_show", rebookUrl: "https://x.test/sunrise" },
  review_request: { clientName: "Riya Kapoor", businessName: "Sunrise", reviewUrl: "https://g.page/r/abc/review" },
  welcome: { name: "Asha Rao", dashboardUrl: "https://x.test/dashboard" },
  business_live: { name: "Asha Rao", businessName: "Sunrise", websiteUrl: "https://sunrise.x.test" },
  business_alert: { kind: "created", clientName: "Riya Kapoor", serviceName: "Checkup", date: "Mon, 2 Nov", time: "10:00 AM", dashboardUrl: "https://x.test/dashboard" },
  daily_summary: {
    businessName: "Sunrise", dateLabel: "Mon, 2 Nov", counts: { bookings: 4, cancelled: 1, noShows: 0, completed: 2 }, paidTotal: 900, currency: "INR",
    upcoming: [{ time: "2:00 PM", clientName: "Riya Kapoor", serviceName: "Checkup" }], dashboardUrl: "https://x.test/dashboard",
  },
  verification: { name: "Asha Rao", secret: SECRET },
  password_reset: { name: "Asha Rao", secret: SECRET },
  owner_account_setup: { name: "Asha Rao", secret: SECRET },
  team_invite: { name: "Asha Rao", secret: SECRET, businessName: "Sunrise", roleName: "Receptionist" },
  customer_verification: { name: "Riya Kapoor", secret: SECRET },
  customer_password_reset: { name: "Riya Kapoor", secret: SECRET },
  customer_account_setup: { name: "Riya Kapoor", secret: SECRET },
  lead: { name: "Asha Rao", demoRequested: true },
  form_notification: { title: "New lead", fields: { Name: "Jo", Demo: true }, at: "2 Nov 2026, 10:00" },
};

const brand = {
  tenant: { name: "Sunrise", logoUrl: "https://x.test/logo.png", color: "#0f766e", fg: "#ffffff", address: "1 Main St", phone: "+91 98765 43210" },
  terms: { packId: "CLINIC" },
};
const unsubscribe = { page: "https://x.test/unsubscribe?s=1", oneClick: "https://x.test/api/unsubscribe?s=1" };

describe("email snapshots", () => {
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
    it(`${id}: branded`, async () => {
      const r = await renderTemplate(id, FIXTURES[id], brand, unsubscribe);
      expect({ subject: r.subject, text: r.text, html: r.html, headers: r.headers }).toMatchSnapshot();
    });
    it(`${id}: unbranded`, async () => {
      const r = await renderTemplate(id, FIXTURES[id]);
      expect({ subject: r.subject, text: r.text, html: r.html }).toMatchSnapshot();
    });
  }
});
