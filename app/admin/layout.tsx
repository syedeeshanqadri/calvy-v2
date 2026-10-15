import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { FlagsProvider } from "@/components/providers/FlagsProvider";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const metadata = { title: "Calvy Admin" };

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
  if (!isAdmin) redirect("/login");

  return (
    <FlagsProvider flags={getFlags()}>
      <AdminLayout>{children}</AdminLayout>
    </FlagsProvider>
  );
}
