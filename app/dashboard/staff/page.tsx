import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits } from "@/lib/plans";
import { redirect } from "next/navigation";
import { StaffClient } from "./StaffClient";

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const businessId = session.user.businessId;

  const [staffList, business] = await Promise.all([
    prisma.staff.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: { plan: true, planStatus: true },
    }),
  ]);

  const limits = getLimits(business?.plan ?? "trial");
  const maxStaff = limits.maxStaff;

  return (
    <StaffClient
      staff={staffList.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        email: s.email,
        phone: s.phone ?? "",
        color: s.color,
        meetingUrl: s.meetingUrl ?? "",
        photoUrl: s.photoUrl ?? "",
        bio: s.bio ?? "",
        specialisation: s.specialisation ?? "",
        isActive: s.isActive,
      }))}
      currentPlan={business?.plan ?? "trial"}
      maxStaff={maxStaff}
    />
  );
}
