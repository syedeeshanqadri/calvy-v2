import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.kind !== "customer" && (session.user.role === "admin" || session.user.email === process.env.SUPER_ADMIN_EMAIL);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status, adminNotes } = await req.json();
  const validStatuses = ["approved", "rejected", "released"];
  if (!validStatuses.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: params.id } });
  if (!withdrawal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.withdrawalRequest.update({
    where: { id: params.id },
    data: {
      status,
      adminNotes: adminNotes || null,
      processedAt: new Date(),
    },
  });

  // No ledger field to decrement — the wallet balance is computed as
  // (paid non-routed appointments) − (released withdrawals), so marking this
  // request "released" above already reduces the available balance.

  return NextResponse.json({ withdrawal: updated });
}
