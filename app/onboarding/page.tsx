import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { wizardOwner } from "@/lib/onboardingAuth";
import { loadWizardState } from "@/lib/onboardingDb";
import { prisma } from "@/lib/prisma";
import { upsertSignupLead } from "@/lib/leads";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // Team members (and anyone who is not a business owner) skip the wizard and land in the dashboard.
  const owner = await wizardOwner();
  if (!owner) redirect("/dashboard");

  const state = await loadWizardState(owner.business.id);
  if (state.completed) redirect("/dashboard");

  // Every owner who reaches onboarding is a lead (an email sign-up already is; a Google sign-up becomes one here), so an abandoned wizard is followed up.
  await upsertSignupLead(prisma, owner.user, { step: state.step }).catch(() => undefined);

  return <OnboardingClient initial={state} ownerName={owner.user.name} />;
}
