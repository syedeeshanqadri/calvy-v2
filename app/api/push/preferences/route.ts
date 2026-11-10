import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { DEFAULT_PREFS, PREF_FIELDS, type PushPrefs } from "@/lib/pushRouting";

export const dynamic = "force-dynamic";

const schema = z.object(Object.fromEntries(PREF_FIELDS.map((f) => [f, z.boolean().optional()])) as Record<(typeof PREF_FIELDS)[number], z.ZodOptional<z.ZodBoolean>>);

/** The signed-in user's own phone-alert choices. Personal: every team member sets their own. */
async function GET_handler() {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.pushPreference.findUnique({ where: { userId: session.access.userId } });
  const prefs: PushPrefs = { ...DEFAULT_PREFS, ...(row ? Object.fromEntries(PREF_FIELDS.map((f) => [f, row[f]])) : {}) };
  const devices = await prisma.pushDevice.count({ where: { userId: session.access.userId } });
  return NextResponse.json({ prefs, devices });
}

async function PUT_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  await prisma.pushPreference.upsert({ where: { userId: session.access.userId }, update: data, create: { userId: session.access.userId, ...data } });
  return NextResponse.json({ ok: true });
}

export const GET = safeRoute(GET_handler);
export const PUT = safeRoute(PUT_handler);
