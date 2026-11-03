import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadNotificationSettings } from "@/lib/notifications/settings";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const [settings, business] = await Promise.all([
    loadNotificationSettings(session.user.businessId),
    prisma.business.findUnique({ where: { id: session.user.businessId }, select: { packId: true, termsOverride: true } }),
  ]);
  if (!settings || !business) redirect("/login");
  return <NotificationsClient initial={settings} terms={business} />;
}
