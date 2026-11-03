import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateDraft } from "@/lib/onboardingDb";

export type WizardOwner = { user: { id: string; name: string; email: string }; business: Awaited<ReturnType<typeof getOrCreateDraft>> };

/**
 * The signed-in business owner and their (draft) business. Returns null when not signed in, for a customer
 * session, or for a team member: invited members never enter the wizard, they land in the dashboard.
 */
export async function wizardOwner(): Promise<WizardOwner | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.kind === "customer") return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, teamMember: { select: { id: true } } } });
  if (!user || user.teamMember) return null;
  return { user, business: await getOrCreateDraft(user) };
}
