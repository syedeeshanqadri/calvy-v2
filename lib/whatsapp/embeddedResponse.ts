import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ConnectResult } from "@/lib/whatsapp/embedded";
import { listCurrentTemplates, publicView } from "@/lib/whatsapp/store";

/** Shared by the connect and PIN routes: turn a ConnectResult into the response the Settings page expects. */
export async function connectResponse(businessId: string, r: ConnectResult) {
  const config = publicView(await prisma.whatsAppConfig.findUnique({ where: { businessId } }));
  if ("needPin" in r) return NextResponse.json({ needPin: true, wrongPin: r.wrongPin, config });
  if (!r.ok) return NextResponse.json({ error: r.error, config }, { status: 400 });
  return NextResponse.json({ ok: true, failures: r.failures, config, templates: await listCurrentTemplates(businessId) });
}
