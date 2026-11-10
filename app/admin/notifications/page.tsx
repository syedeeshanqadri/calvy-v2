import { requireAdminPage } from "@/lib/admin/auth";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireAdminPage();
  return <NotificationsClient />;
}
