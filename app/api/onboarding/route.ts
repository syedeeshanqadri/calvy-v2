import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { wizardOwner } from "@/lib/onboardingAuth";
import { loadWizardState, saveStep, skipStep, SlugTakenError } from "@/lib/onboardingDb";
import { SKIPPABLE, STEPS, isSavableStep, stepSchemas } from "@/lib/onboarding";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { touchSignupLead } from "@/lib/leads";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Record the progress on the sign-up lead (restarts the reminder clock). Never blocks saving the step. */
async function noteProgress(w: { user: { id: string; name: string; email: string } }, step: number) {
  await touchSignupLead(prisma, w.user, step).catch((err) => logger.error("[onboarding] lead not updated", { err }));
}

export const dynamic = "force-dynamic";

/** Current wizard state (creates the draft business for a fresh Google sign-up). */
async function GET_handler() {
  const w = await wizardOwner();
  if (!w) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadWizardState(w.business.id));
}

const bodySchema = z.object({
  step: z.enum(STEPS),
  skip: z.boolean().optional(),
  data: z.unknown().optional(),
});

/** Save (or skip) one step. Each step is validated with its own zod schema on the server. */
async function PATCH_handler(req: NextRequest) {
  const w = await wizardOwner();
  if (!w) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`onboarding:${w.user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { step, skip, data } = parsed.data;
  if (!isSavableStep(step)) return NextResponse.json({ error: "Nothing to save on this step." }, { status: 400 });

  if (skip) {
    if (!SKIPPABLE.has(step)) return NextResponse.json({ error: "This step cannot be skipped." }, { status: 400 });
    await skipStep(w.business.id, step);
    const state = await loadWizardState(w.business.id);
    await noteProgress(w, state.step);
    return NextResponse.json(state);
  }

  const v = stepSchemas[step].safeParse(data);
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  try {
    await saveStep(w.business.id, step, v.data as never);
  } catch (err) {
    if (err instanceof SlugTakenError) return NextResponse.json({ error: err.message, field: "slug" }, { status: 409 });
    if (err instanceof Error && /^(The Free plan|Add at least)/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  const state = await loadWizardState(w.business.id);
  await noteProgress(w, state.step);
  return NextResponse.json(state);
}

export const GET = safeRoute(GET_handler);
export const PATCH = safeRoute(PATCH_handler);
