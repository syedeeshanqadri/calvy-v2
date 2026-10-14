import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { websiteJson } = body;

  if (typeof websiteJson !== "string")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    JSON.parse(websiteJson);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await prisma.business.update({
    where: { id: session.user.businessId },
    data: { websiteJson },
  });

  return NextResponse.json({ ok: true });
}
