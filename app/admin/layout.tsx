import { notFound } from "next/navigation";
import { adminState } from "@/lib/admin/auth";
import { getFlags } from "@/lib/flags";
import { FlagsProvider } from "@/components/providers/FlagsProvider";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const metadata = { title: "Calvy Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const st = await adminState();
  // Anyone who is not a super admin (or not signed in) gets the same 404 as a page that does not exist.
  if (st.state === "none") notFound();
  // A super admin who has not entered an authenticator code yet sees only the 2FA page (every other page redirects there).
  if (st.state === "needs2fa") return <div className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center p-4">{children}</div>;
  return (
    <FlagsProvider flags={getFlags()}>
      <AdminLayout adminEmail={st.ctx.user.email}>{children}</AdminLayout>
    </FlagsProvider>
  );
}
