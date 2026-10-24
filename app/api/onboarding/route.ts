import { after } from "next/server";
import { sendFormNotification } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";

import { parseBody } from "@/lib/validation/common";
import { onboardingSchema } from "@/lib/validation/public";
export const dynamic = "force-dynamic";

// Completes registration for a logged-in user who has no business yet
// (typically after Google/Facebook sign-in).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.businessId) {
    return NextResponse.json({ error: "Registration already complete." }, { status: 400 });
  }

  const parsed = await parseBody(req, onboardingSchema);
  if (!parsed.ok) return parsed.res;
  const { businessName, currency, timezone } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { business: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.business) {
    return NextResponse.json({ error: "Registration already complete." }, { status: 400 });
  }

  const business = await createBusinessForUser({
    ownerId: user.id,
    ownerName: user.name,
    ownerEmail: user.email,
    businessName,
    currency,
    timezone,
  });

  after(() => sendFormNotification({
    title: "New business onboarded",
    fields: { Owner: user.name, Email: user.email, Business: business.name, Currency: business.currency, Timezone: business.timezone },
  }));

  return NextResponse.json({ success: true });
}
