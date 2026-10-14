import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const features = await getBusinessFeatures(businessId);
  if (!features.prioritySupport) {
    return NextResponse.json({ error: "Support is not available on your current plan" }, { status: 403 });
  }

  const tickets = await prisma.supportTicket.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const features = await getBusinessFeatures(businessId);
  if (!features.prioritySupport) {
    return NextResponse.json({ error: "Support is not available on your current plan" }, { status: 403 });
  }

  const body = await req.json();
  const { subject, body: messageBody, priority } = body;

  if (!subject?.trim() || !messageBody?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      businessId,
      subject: subject.trim(),
      priority: priority ?? "normal",
      messages: {
        create: {
          senderRole: "tenant",
          body: messageBody.trim(),
        },
      },
    },
    include: {
      messages: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(ticket, { status: 201 });
}
