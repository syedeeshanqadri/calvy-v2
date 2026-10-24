import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ bookingMode: z.enum(["SLOT", "TOKEN"]) });

// Switch the business between time-slot and token booking.
async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  await prisma.business.update({ where: { id: businessId }, data: { bookingMode: parsed.data.bookingMode } });
  return NextResponse.json({ bookingMode: parsed.data.bookingMode });
}

export const POST = safeRoute(POST_handler);
