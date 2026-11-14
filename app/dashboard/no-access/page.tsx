import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const dynamic = "force-dynamic";
export const metadata = { title: "No access | Calvy", robots: { index: false, follow: false } };

/** Where a signed-in team member lands after opening a page their role does not include (instead of silently showing the home screen). */
export default async function NoAccessPage() {
  if (!(await getServerSession(authOptions))) redirect("/login");
  return (
    <DashboardLayout title="No access">
      <div className="max-w-md mx-auto text-center bg-white rounded-2xl border border-[#e8e6e0] p-8 mt-6" data-testid="no-access">
        <h2 className="font-syne font-bold text-lg">You don&apos;t have access to this page</h2>
        <p className="text-sm text-[#6b6b80] mt-2">Your role doesn&apos;t include it. If you need it, ask the business owner to update your access.</p>
        <Link href="/dashboard" className="mt-5 inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">Back to Today</Link>
      </div>
    </DashboardLayout>
  );
}
