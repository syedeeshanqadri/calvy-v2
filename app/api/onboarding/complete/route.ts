import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { wizardOwner } from "@/lib/onboardingAuth";
import { completeOnboarding } from "@/lib/onboardingDb";

export const dynamic = "force-dynamic";

/** Finish the wizard: marks it complete and sends the "business is live" email once. */
async function POST_handler() {
  const w = await wizardOwner();
  if (!w) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await completeOnboarding(w.business.id, w.user);
  return NextResponse.json({ success: true, slug: r.slug });
}

export const POST = safeRoute(POST_handler);
