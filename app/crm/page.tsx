import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { CrmBoard } from "./CrmBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Calvy", robots: { index: false } };

export default async function CrmPage() {
  await requireAdminPage();

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });

  return <CrmBoard initialLeads={leads.map(l => ({ ...l, createdAt: l.createdAt.toISOString() }))} />;
}
