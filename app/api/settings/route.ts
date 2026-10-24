import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncBusinessHours } from "@/lib/schedule";
import { settingsPatchSchema } from "@/lib/validation/settings";

export const dynamic = 'force-dynamic';

async function GET_handler() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: {
      id: true, name: true, slug: true, businessType: true,
      phone: true, email: true, address: true, website: true,
      description: true, primaryColor: true, availabilityJson: true, currency: true, slotInterval: true,
    },
  });

  return NextResponse.json({ business });
}

async function PATCH_handler(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  // Zod strips keys outside the allow-list; undefined values are skipped.
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) data[key] = value;
  }

  const businessId = session.user.businessId;
  // The booking engine reads WorkingHours, so a changed week is written there too.
  const business = await prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({ where: { id: businessId }, data });
    if (typeof data.availabilityJson === "string") {
      await syncBusinessHours(tx, businessId, data.availabilityJson);
    }
    return updated;
  });

  return NextResponse.json({ business });
}

export const GET = safeRoute(GET_handler);
export const PATCH = safeRoute(PATCH_handler);
