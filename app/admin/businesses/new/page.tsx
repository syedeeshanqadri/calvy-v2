import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import CreateBusinessForm from "./CreateBusinessForm";

export const dynamic = "force-dynamic";

export default async function NewBusinessPage() {
  await requireAdminPage();
  return (
    <div className="p-8 max-w-xl space-y-4">
      <Link href="/admin/businesses" className="text-xs text-[#6b6b80] hover:underline">← Businesses</Link>
      <h1 className="font-syne font-bold text-2xl">Create a business</h1>
      <p className="text-sm text-[#6b6b80]">For an owner who has no account yet. They get an email to verify their address and set a password, then finish the setup wizard.</p>
      <CreateBusinessForm />
    </div>
  );
}
