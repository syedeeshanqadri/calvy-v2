import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { REGION_PRICING, WHATSAPP_NOTE } from "@/lib/pricing";
import { PLAN_META } from "@/lib/planMeta";
import { CONTACT, SUPPORT_EMAIL, SITE_URL } from "@/lib/site";
import { LANDING_FAQ } from "@/lib/landingFaq";

const read = (p: string) => readFileSync(p, "utf8");

describe("step-21 honest public site", () => {
  it("the landing page has no invented customer counts, ratings or testimonials", () => {
    const files = readdirSync("components/landing").map((f) => `components/landing/${f}`).concat("app/page.tsx");
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/12,000|2,400|147 businesses|3\.2M|98%|Trusted by|Testimonial/);
    }
  });
  it("International prices come from PLAN_META, not from copies", () => {
    const [, pro, business] = REGION_PRICING.INTL.plans;
    expect([pro.monthly, pro.yearlyPerMonth]).toEqual([PLAN_META.professional.price, PLAN_META.professional.annualPrice]);
    expect([business.monthly, business.yearlyPerMonth]).toEqual([PLAN_META.business.price, PLAN_META.business.annualPrice]);
    expect(read("lib/pricing.ts")).toMatch(/from "@\/lib\/planMeta"/);
  });
  it("India states a nominal platform fee (no amount on the marketing pages), and WhatsApp charges are said to be billed by Meta", () => {
    expect(REGION_PRICING.IN.plans[0].features.join(" ")).toMatch(/nominal platform fee/);
    expect(WHATSAPP_NOTE).toMatch(/billed by Meta/);
    expect(read("components/landing/PricingClient.tsx")).toContain("WHATSAPP_NOTE");
  });
  it("yearly is the default for International only", () => {
    expect(read("components/landing/PricingClient.tsx")).toContain('choice ?? region === "INTL"');
  });
  it("contact details: the legal entity is Raybit Technologies Pvt Ltd and no sole proprietor is named anywhere", () => {
    expect(CONTACT.legalName).toBe("Raybit Technologies Pvt Ltd");
    expect(SUPPORT_EMAIL).toBe("support@calvy.io");
    const dirs = ["app", "components", "lib"];
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(e.name) && /Eeshan|Ajaz|proprietor/i.test(read(p))) hits.push(p);
      }
    };
    dirs.forEach(walk);
    expect(hits).toEqual([]);
    expect(read("app/contact/page.tsx")).toContain("CONTACT.legalName");
    expect(read("app/terms/page.tsx")).toContain("CONTACT.legalName");
  });
  it("the phone number appears only on the contact, refund and privacy pages (and the signed-in Support page)", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?)$/.test(e.name) && /CONTACT\.phone|60052 86335|6005286335/.test(read(p))) hits.push(p);
      }
    };
    ["app", "components"].forEach(walk);
    expect(hits.sort()).toEqual(["app/contact/page.tsx", "app/dashboard/contact/page.tsx", "app/privacy/page.tsx", "app/refund-policy/page.tsx"]);
  });
  it("legal pages name the processors and the refund rules", () => {
    const privacy = read("app/privacy/page.tsx");
    for (const n of ["Cashfree", "Meta", "Google", "Resend"]) expect(privacy).toContain(n);
    const refund = read("app/refund-policy/page.tsx");
    for (const n of ["₹10", "non-refundable", "rebook", "does not collect or hold service fees", "own payment gateway", "5–7 working days", "last-minute", "partial billing periods"]) expect(refund).toContain(n);
    const terms = read("app/terms/page.tsx");
    for (const n of ["does not collect or hold service fees", "non-refundable", "one rebooking", "partial billing periods"]) expect(terms).toContain(n);
    for (const f of ["app/refund-policy/page.tsx", "app/terms/page.tsx", "app/contact/page.tsx", "app/privacy/page.tsx"]) expect(read(f), f).not.toMatch(/wallet credit|wallet/i);
    expect(read("app/service-delivery/page.tsx")).toMatch(/digital/i);
    // Razorpay is no longer Calvy's own processor: it may appear only as one of the gateways a BUSINESS connects (privacy page).
    for (const f of ["app/terms/page.tsx", "app/refund-policy/page.tsx"]) expect(read(f)).not.toContain("Razorpay");
    const privacyText = read("app/privacy/page.tsx");
    for (const g of ["Razorpay", "Cashfree", "PhonePe", "PayU", "CCAvenue", "Paytm", "Stripe", "PayPal"]) expect(privacyText).toContain(g);
    expect(privacyText).toContain("own payment gateway");
  });
  it("the data deletion page says how to ask, what is deleted and what may be kept, with no phone number or proprietor name", () => {
    const page = read("app/data-deletion/page.tsx");
    for (const t of ["SUPPORT_EMAIL", "Delete my data", "What we delete", "What we may keep", "Disconnect", "/privacy"]) expect(page).toContain(t);
    expect(page).not.toMatch(/Eeshan|CONTACT\.phone|60052 86335/);
  });
  it("footer links the legal and company pages, and the sitemap lists them", () => {
    const footer = read("components/landing/Footer.tsx");
    const sitemap = read("app/sitemap.ts");
    for (const path of ["/about", "/contact", "/privacy", "/terms", "/refund-policy", "/service-delivery", "/data-deletion"]) {
      expect(footer).toContain(`"${path}"`);
      expect(sitemap).toContain(`${path}\``);
    }
  });
  it("one SITE_URL drives canonical, sitemap, robots and JSON-LD", () => {
    expect(SITE_URL).toMatch(/^https?:\/\/[^/]+$/);
    for (const f of ["app/layout.tsx", "app/sitemap.ts", "app/robots.ts", "app/page.tsx"]) expect(read(f)).toContain("SITE_URL");
    const home = read("app/page.tsx");
    for (const t of ['"Organization"', '"SoftwareApplication"', '"FAQPage"']) expect(home).toContain(t);
    expect(LANDING_FAQ.length).toBeGreaterThanOrEqual(6);
  });
});

describe("step-26 public gaps", () => {
  const read2 = read;
  it("no customer-facing wallet wording on the public site, landing FAQ or queue page", () => {
    for (const f of ["app/about/page.tsx", "lib/landingFaq.ts", "lib/landingFeatures.ts", "app/booking/[code]/TrackClient.tsx", "app/dashboard/queue/QueueClient.tsx", "app/cookies/page.tsx"]) {
      expect(read2(f), f).not.toMatch(/wallet credit|in (your|their) wallet|customer's wallet/i);
    }
    expect(read2("app/about/page.tsx")).not.toMatch(/through Cashfree/);
    expect(read2("lib/landingFaq.ts")).not.toMatch(/Payments are processed by Cashfree/);
  });
  it("landing lists own gateways per region and rewards, without describing how rewards work", () => {
    const f = read2("lib/landingFeatures.ts");
    for (const n of ["your own payment account", "Stripe or PayPal", "Rewards", "lots more rewards"]) expect(f).toContain(n);
    expect(f).not.toMatch(/7 (attended|visits)|every 8th|8th/i);
  });
  it("terms explain upgrades; contact shows the team address; cookie and for pages exist and are in the sitemap and footer", () => {
    expect(read2("app/terms/page.tsx")).toMatch(/Upgrades.*start immediately/);
    expect(read2("app/contact/page.tsx")).toContain("TEAM_EMAIL");
    expect(read2("components/landing/Footer.tsx")).toContain("/cookies");
    const sm = read2("app/sitemap.ts");
    expect(sm).toContain("/cookies");
    expect(sm).toContain("FOR_PAGES");
  });
});
