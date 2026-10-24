import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { adminMessageSchema, adminTicketPatchSchema } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

async function GET_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      business: {
        select: {
          name: true,
          owner: { select: { email: true, name: true } },
        },
      },
    },
  });

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(ticket);
}

async function POST_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, adminMessageSchema);
  if (!parsed.ok) return parsed.res;
  const { body: messageBody } = parsed.data;

  const newStatus = ticket.status === "open" ? "in_progress" : ticket.status;

  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: params.id,
        senderRole: "admin",
        body: messageBody,
      },
    }),
    prisma.supportTicket.update({
      where: { id: params.id },
      data: { updatedAt: new Date(), status: newStatus },
    }),
  ]);

  return NextResponse.json(message, { status: 201 });
}

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed2 = await parseBody(req, adminTicketPatchSchema);
  if (!parsed2.ok) return parsed2.res;
  const { status, priority } = parsed2.data;

  const updated = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
export const PATCH = safeRoute(PATCH_handler);
