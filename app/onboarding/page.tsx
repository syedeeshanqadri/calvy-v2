import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // Already has a business → registration is complete.
  const existing = await prisma.business.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (existing) redirect("/dashboard");

  return <OnboardingClient name={session.user.name ?? ""} />;
}
