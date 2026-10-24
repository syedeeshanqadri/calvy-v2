import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActivePlan } from "@/lib/plans";
import { findClientByEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";
import { safeTimeZone } from "@/lib/time";

import { parseBody } from "@/lib/validation/common";
import { clientCreateSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

async function POST_handler(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, clientCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { name, email, phone, notes } = parsed.data;

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true, timezone: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }

  const e164 = normalizePhone(phone, safeTimeZone(business.timezone));
  if (phone && !e164) {
    return NextResponse.json({ error: "That phone number doesn't look right." }, { status: 400 });
  }
  if (email && (await findClientByEmail(prisma, session.user.businessId, email))) {
    return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 });
  }
  if (e164 && (await prisma.client.findFirst({ where: { businessId: session.user.businessId, phone: e164 }, select: { id: true } }))) {
    return NextResponse.json({ error: "A client with this phone number already exists" }, { status: 409 });
  }

  const client = await prisma.client.create({
    data: {
      businessId: session.user.businessId,
      name,
      email: email ?? null,
      phone: e164,
      notes: notes || "",
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}

export const POST = safeRoute(POST_handler);
