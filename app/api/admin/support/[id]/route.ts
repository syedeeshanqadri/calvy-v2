import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { body: messageBody } = body;

  if (!messageBody?.trim()) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  const newStatus = ticket.status === "open" ? "in_progress" : ticket.status;

  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: params.id,
        senderRole: "admin",
        body: messageBody.trim(),
      },
    }),
    prisma.supportTicket.update({
      where: { id: params.id },
      data: { updatedAt: new Date(), status: newStatus },
    }),
  ]);

  return NextResponse.json(message, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { status, priority } = body;

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
