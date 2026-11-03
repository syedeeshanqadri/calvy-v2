import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@react-email/render";
import {
  BookingCancellationEmail, BookingConfirmationEmail, BookingReminderEmail, BookingRescheduleEmail,
  InvoiceEmail, QueueClosedEmail, QueueMovedBackEmail, EmailVerificationEmail, type BookingProps,
} from "@/emails/templates";

// step-6/redesign-emails: every customer-facing booking email carries the business's branding and
// uses the same plain wording as the website (no "token", no emoji).

const tenant = { name: "Sunrise Clinic", color: "#0f766e", fg: "#ffffff", address: "12 Main Road, Bengaluru", phone: "+91 80 4000 1234" };
const base: BookingProps = {
  clientName: "Riya Kapoor", businessName: "Sunrise Clinic", serviceName: "General consultation", staffName: "Dr. Rao",
  date: "Mon, 26 Oct", time: "10:00 AM", duration: 20, price: 500, currency: "INR", tenant,
  terms: { packId: "CLINIC" }, trackUrl: "https://example.test/q/abc",
};
const queue = { ...base, token: { number: 7, estimatedTime: "11:20 AM", sessionName: "Morning" } };

const emails: [string, () => Promise<{ html: string; text: string }>][] = [];
const add = (name: string, el: React.ReactElement) =>
  emails.push([name, async () => ({ html: await render(el), text: (await render(el, { plainText: true })).replace(/\s+/g, " ") })]);
add("confirmation", createElement(BookingConfirmationEmail, base));
add("confirmation (queue)", createElement(BookingConfirmationEmail, queue));
add("reminder", createElement(BookingReminderEmail, base));
add("cancellation", createElement(BookingCancellationEmail, { ...base, rebookUrl: "https://example.test/book" }));
add("reschedule", createElement(BookingRescheduleEmail, { ...base, oldDate: "Sun", oldTime: "9:00 AM" }));
add("queue moved back", createElement(QueueMovedBackEmail, { ...queue, place: 3 }));
add("queue closed", createElement(QueueClosedEmail, { ...queue, reason: "missed", creditLabel: "Rs 500", loginUrl: "https://example.test/login" }));
add("receipt", createElement(InvoiceEmail, { ...base, invoiceNumber: "INV-1", clientEmail: "riya@example.com" }));

describe("booking emails carry the business's branding", () => {
  it.each(emails)("%s: business colour header, its address and phone, Calvy credit", async (_n, build) => {
    const { html, text } = await build();
    expect(html).toContain("background-color:#0f766e");
    expect(text).toContain("Sunrise Clinic");
    expect(text).toContain("12 Main Road, Bengaluru");
    expect(text).toContain("+91 80 4000 1234");
    expect(text).toContain("Want a site like this? Grab it on Calvy");
    expect(html).not.toContain("● Calvy");
  });

  it.each(emails)("%s: customers never see the word token, and there is no emoji", async (_n, build) => {
    const { text } = await build();
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("booking email details", () => {
  it("a queue booking shows the queue number", async () => {
    const text = (await render(createElement(BookingConfirmationEmail, queue), { plainText: true })).replace(/\s+/g, " ");
    expect(text).toMatch(/Queue number\s*#7/);
    expect(text).toContain("Track your place in line");
  });

  it("buttons use the business colour", async () => {
    const html = await render(createElement(BookingCancellationEmail, { ...base, rebookUrl: "https://example.test/book" }));
    const button = html.match(/<a href="https:\/\/example\.test\/book"[^>]*>/)?.[0] ?? "";
    expect(button).toContain("background-color:#0f766e");
    expect(button).toContain("color:#ffffff");
  });

  it("a light business colour still gets a readable header and button text", async () => {
    const light = { ...tenant, color: "#fde047", fg: "#0f0f1a" };
    const html = await render(createElement(BookingCancellationEmail, { ...base, tenant: light, rebookUrl: "https://example.test/book" }));
    expect(html).toContain("background-color:#fde047");
    expect(html.match(/<a href="https:\/\/example\.test\/book"[^>]*>/)?.[0]).toContain("color:#0f0f1a");
  });

  it("without a known business the email falls back to Calvy branding", async () => {
    const html = await render(createElement(BookingReminderEmail, { ...base, tenant: undefined }));
    expect(html).toContain("● Calvy");
    expect(html).not.toContain("Grab it on Calvy");
  });

  it("Calvy's own account emails keep the Calvy header and footer", async () => {
    const text = (await render(createElement(EmailVerificationEmail, { name: "Sam", verifyUrl: "https://example.test/v" }), { plainText: true })).replace(/\s+/g, " ");
    expect(text).toContain("Help Center");
    expect(text).not.toContain("Want a site like this?");
  });
});
