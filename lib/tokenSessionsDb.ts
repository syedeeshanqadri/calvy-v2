import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOverlap, queueKindConflict, minToHhmm, type SessionLike, type TokenSessionInput, toSessionFields } from "@/lib/tokens";

/** Shape sent to the dashboard (HH:MM times). */
export function serializeSession(s: SessionLike & { id: string }) {
  return {
    id: s.id, name: s.name, staffId: s.staffId, weekdays: s.weekdays,
    startTime: minToHhmm(s.startMin), endTime: minToHhmm(s.endMin),
    minutesPerToken: s.minutesPerToken, isActive: s.isActive,
  };
}

/**
 * Create (id undefined) or update a token session for the business, rejecting overlaps within the
 * same queue. Serialised per business so two parallel saves cannot both pass the overlap check.
 */
export async function saveTokenSession(businessId: string, input: TokenSessionInput, id?: string): Promise<NextResponse> {
  const fields = toSessionFields(input);
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"tokensessions:" + businessId}, 0))`;
    if (id && !(await tx.tokenSession.findFirst({ where: { id, businessId }, select: { id: true } }))) return { notFound: true as const };
    if (fields.staffId && !(await tx.staff.findFirst({ where: { id: fields.staffId, businessId }, select: { id: true } }))) {
      return { badStaff: true as const };
    }
    const all = await tx.tokenSession.findMany({ where: { businessId } });
    const mixed = queueKindConflict({ ...fields, id }, all);
    if (mixed) return { mixed };
    const clash = findOverlap({ ...fields, id }, all.filter((e) => e.staffId === fields.staffId));
    if (clash) return { clash };
    const saved = id
      ? await tx.tokenSession.update({ where: { id }, data: fields })
      : await tx.tokenSession.create({ data: { ...fields, businessId } });
    return { saved };
  });

  if ("notFound" in result) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if ("badStaff" in result) return NextResponse.json({ error: "Staff member not found." }, { status: 400 });
  if ("mixed" in result && result.mixed) return NextResponse.json({ error: result.mixed }, { status: 409 });
  if ("clash" in result && result.clash) {
    const c = result.clash;
    return NextResponse.json(
      { error: `Overlaps "${c.name}" (${minToHhmm(c.startMin)}-${minToHhmm(c.endMin)}) on a shared day for the same queue.` },
      { status: 409 },
    );
  }
  return NextResponse.json({ session: serializeSession(result.saved!) }, { status: id ? 200 : 201 });
}
