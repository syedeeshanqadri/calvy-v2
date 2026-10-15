import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { appSettingsPatchSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

type Session = Awaited<ReturnType<typeof getServerSession<typeof authOptions>>>;

function isAdmin(session: Session) {
  return session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.appSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return NextResponse.json({ settings: map });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, appSettingsPatchSchema);
  if (!parsed.ok) return parsed.res;
  await Promise.all(
    Object.entries(parsed.data).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
