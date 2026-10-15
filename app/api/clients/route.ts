import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActivePlan } from "@/lib/plans";
import { normalizeEmail, findClientByEmail } from "@/lib/email-normalize";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, email: rawEmail, phone, notes } = body;
  const email: string = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : rawEmail;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  if (phone) {
    const phoneRegex = /^\+?[0-9\s\-\.\(\)]{10,20}$/;
    if (!phoneRegex.test(phone.trim())) {
      return NextResponse.json({ error: "Please enter a valid phone number" }, { status: 400 });
    }
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }

  const existing = await findClientByEmail(prisma, session.user.businessId, email);
  if (existing) {
    return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 });
  }

  const client = await prisma.client.create({
    data: {
      businessId: session.user.businessId,
      name,
      email,
      phone: phone || "",
      notes: notes || "",
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
