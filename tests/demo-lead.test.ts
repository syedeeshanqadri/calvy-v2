import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "@react-email/render";
import { LeadAcknowledgmentEmail } from "@/emails/templates";
import { leadSchema } from "@/lib/validation/public";

// chore/home-get-started-cta: the "Book a personal demo" modal posts email + phone; the lead gets a "demo booked" email.

describe("demo request", () => {
  it("the lead schema takes email, phone and the demo flag", () => {
    const r = leadSchema.safeParse({ email: "owner@salon.com", phone: "+91 98765 43210", demoRequested: true, source: "hero-demo" });
    expect(r.success).toBe(true);
    expect(leadSchema.safeParse({ phone: "+91 98765 43210", demoRequested: true }).success).toBe(false);
  });
  it("the demo email says it is booked and that they will be contacted", async () => {
    const html = await render(createElement(LeadAcknowledgmentEmail, { name: "owner", demoRequested: true }));
    expect(html).toContain("Your demo is booked");
    expect(html).toMatch(/contacted soon/);
  });
  it("a plain lead still gets the generic thanks", async () => {
    const html = await render(createElement(LeadAcknowledgmentEmail, { name: "owner", demoRequested: false }));
    expect(html).toContain("Thanks, owner");
    expect(html).not.toContain("demo is booked");
  });
});
