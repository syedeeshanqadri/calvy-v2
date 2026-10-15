import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
    select: { id: true, businessId: true, clientId: true, price: true, paymentStatus: true, paymentMode: true },
  });

  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appointment.paymentStatus === "paid") return NextResponse.json({ error: "Already marked as paid" }, { status: 400 });

  const [updated] = await prisma.$transaction([
    prisma.appointment.update({
      where: { id: params.id },
      data: { paymentStatus: "paid" },
    }),
    prisma.client.update({
      where: { id: appointment.clientId },
      data: { totalSpent: { increment: appointment.price } },
    }),
  ]);

  return NextResponse.json({ appointment: updated });
}
