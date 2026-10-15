import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validation/misc";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth, businessId: session.user.businessId },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, businessId: session.user.businessId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const { endpoint } = parsed.data;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, businessId: session.user.businessId },
    });
  }
  return NextResponse.json({ ok: true });
}
