import { getServerSession } from "next-auth";
import { isAdminUser } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CrmBoard } from "./CrmBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Calvy", robots: { index: false } };

export default async function CrmPage() {
  const session = await getServerSession(authOptions);
  const isAdmin =
    isAdminUser(session?.user);

  if (!session?.user) redirect("/login");
  if (!isAdmin) redirect("/dashboard");

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });

  return <CrmBoard initialLeads={leads.map(l => ({ ...l, createdAt: l.createdAt.toISOString() }))} />;
}
