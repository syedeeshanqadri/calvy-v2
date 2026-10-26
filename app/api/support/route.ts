import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { rateLimit } from "@/lib/ratelimit";

import { parseBody } from "@/lib/validation/common";

import { ticketCreateSchema } from "@/lib/validation/misc";

export const dynamic = 'force-dynamic';

async function GET_handler() {
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`support:${businessId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, ticketCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { subject, body: messageBody, priority: asked } = parsed.data;
  // Priority support is a speed, not access: those plans' tickets are never ranked below "high".
  const features = await getBusinessFeatures(businessId);
  const priority = features.prioritySupport && (asked === "low" || asked === "normal") ? "high" : asked;

  const ticket = await prisma.supportTicket.create({
    data: {
      businessId,
      subject,
      priority,
      messages: {
        create: {
          senderRole: "tenant",
          body: messageBody,
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

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
