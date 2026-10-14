import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AdminSupportClient } from "./AdminSupportClient";

export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
  if (!isAdmin) redirect("/login");

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      business: {
        select: {
          name: true,
          owner: { select: { email: true, name: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  // Serialize dates for client component
  const serialized = JSON.parse(JSON.stringify(tickets));
  return <AdminSupportClient tickets={serialized} />;
}
