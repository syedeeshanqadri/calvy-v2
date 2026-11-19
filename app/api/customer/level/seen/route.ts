import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import { markLevelUpSeen } from "@/lib/rewards/levelService";

export const dynamic = "force-dynamic";

/** The signed-in, verified customer has seen their level-up screen. Only their own level is touched. */
async function POST_handler() {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.verified) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  await markLevelUpSeen(prisma, { email: me.email });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
