import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

import { parseBody } from "@/lib/validation/common";

import { ticketMessageSchema } from "@/lib/validation/misc";

export const dynamic = 'force-dynamic';

async function GET_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!ticket || ticket.businessId !== businessId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(ticket);
}

async function POST_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const ticket = await prisma.supportTicket.findFirst({ where: { id: params.id, businessId } });
  if (!ticket || ticket.businessId !== businessId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, ticketMessageSchema);
  if (!parsed.ok) return parsed.res;
  const { body: messageBody } = parsed.data;

  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: params.id,
        senderRole: "tenant",
        body: messageBody,
      },
    }),
    prisma.supportTicket.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json(message, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
