import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLeadAcknowledgment, sendFormNotification } from "@/lib/email";
import { after } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

import { parseBody } from "@/lib/validation/common";

import { leadSchema } from "@/lib/validation/public";

export const dynamic = "force-dynamic";

async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`lead:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, leadSchema);
  if (!parsed.ok) return parsed.res;
  const { name, email, phone, businessType, demoRequested, message, source } = parsed.data;
  const cleanEmail = email;

  // Email-only forms (newsletter, hero) may omit name — derive from the address.
  const cleanName = name || cleanEmail.split("@")[0];

  // Attribution: sanitize the source to a short slug so the CRM can show origin.
  const cleanSource = typeof source === "string"
    ? source.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "landing"
    : "landing";

  const lead = await prisma.lead.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      phone: phone || null,
      businessType: businessType || null,
      demoRequested: !!demoRequested,
      message: message || null,
      source: cleanSource,
      status: "new",
    },
  });

  // First nurture touch — instant acknowledgment to the lead (non-blocking).
  sendLeadAcknowledgment({ to: lead.email, name: lead.name, demoRequested: lead.demoRequested })
    .catch(() => {});

  // Tell the owner (after the response, errors swallowed inside the helper).
  after(() => sendFormNotification({
    title: lead.demoRequested ? "New demo request" : "New lead",
    fields: {
      Name: lead.name,
      Email: lead.email,
      Phone: lead.phone,
      "Business type": lead.businessType,
      "Demo requested": lead.demoRequested,
      Message: lead.message,
      Source: lead.source,
    },
  }));

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201 });
}

export const POST = safeRoute(POST_handler);
