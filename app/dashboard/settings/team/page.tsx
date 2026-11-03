import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";
import { serializeMember } from "@/lib/teamDb";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

// Owner only: team management is never a ticked permission.
export default async function TeamPage() {
  const session = await pageAccess("owner");
  const businessId = session.user.businessId;
  const [features, members, staff] = await Promise.all([
    getBusinessFeatures(businessId),
    prisma.teamMember.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.staff.findMany({ where: { businessId, isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  if (features.maxTeamMembers === 0 && members.length === 0) {
    return <UpgradeGate title="Team" subtitle="Give your staff their own login" description="Team logins are not included in your plan. Upgrade to add receptionists and practitioners with their own access." />;
  }
  return <TeamClient initial={members.map(serializeMember)} staff={staff} limit={features.maxTeamMembers} />;
}
