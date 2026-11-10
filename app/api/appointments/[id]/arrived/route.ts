import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession, appointmentWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { arrivedProblem } from "@/lib/arrived";

export const dynamic = "force-dynamic";

/**
 * Reception marks a customer as arrived (slot booking) or present when called (token). It only stamps `arrivedAt`: the queue
 * keeps its own states (waiting, serving, done, not present...), and "Not present" stays the existing queue action.
 */
async function POST_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await accessSession(["appointments.write", "queue.control"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const a = await prisma.appointment.findFirst({
    where: { id, businessId: session.user.businessId, ...appointmentWhere(session.access) },
    select: { id: true, status: true, tokenNumber: true, queueState: true, arrivedAt: true },
  });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const perms = session.access.permissions;
  const problem = arrivedProblem(a, { isOwner: session.access.isOwner, write: can(perms, "appointments.write"), queue: can(perms, "queue.control") });
  if (problem) return NextResponse.json({ error: problem.message }, { status: problem.status });

  // Idempotent: the first tap wins, a double tap changes nothing.
  const done = await prisma.appointment.updateMany({ where: { id: a.id, arrivedAt: null }, data: { arrivedAt: new Date() } });
  const fresh = await prisma.appointment.findUnique({ where: { id: a.id }, select: { arrivedAt: true } });
  return NextResponse.json({ ok: true, arrivedAt: fresh?.arrivedAt ?? null, changed: done.count === 1 });
}

export const POST = safeRoute(POST_handler);
