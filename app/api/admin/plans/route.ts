import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { ensureSeededPlans } from "@/lib/planConfigDb";

export const dynamic = 'force-dynamic';


async function GET_handler() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

  const plans = await ensureSeededPlans();
  return NextResponse.json(plans);
}

export const GET = safeRoute(GET_handler);
