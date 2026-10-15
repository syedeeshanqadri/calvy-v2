import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { websitePatchSchema } from "@/lib/validation/misc";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, websitePatchSchema);
  if (!parsed.ok) return parsed.res;
  const { websiteJson } = parsed.data;

  await prisma.business.update({
    where: { id: session.user.businessId },
    data: { websiteJson },
  });

  return NextResponse.json({ ok: true });
}
