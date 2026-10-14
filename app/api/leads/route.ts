import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLeadAcknowledgment } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`lead:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { name, email, phone, businessType, demoRequested, message, source } = body;

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Email-only forms (newsletter, hero) may omit name — derive from the address.
  const cleanName = name?.trim() || cleanEmail.split("@")[0];

  // Attribution: sanitize the source to a short slug so the CRM can show origin.
  const cleanSource = typeof source === "string"
    ? source.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "landing"
    : "landing";

  const lead = await prisma.lead.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      phone: phone?.trim() || null,
      businessType: businessType?.trim() || null,
      demoRequested: !!demoRequested,
      message: message?.trim() || null,
      source: cleanSource,
      status: "new",
    },
  });

  // First nurture touch — instant acknowledgment to the lead (non-blocking).
  sendLeadAcknowledgment({ to: lead.email, name: lead.name, demoRequested: lead.demoRequested })
    .catch(() => {});

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201 });
}
