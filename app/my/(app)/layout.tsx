import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/customerSession";
import { MyShell } from "@/components/my/MyShell";

export const dynamic = "force-dynamic";

// Every signed-in customer screen (/my, /my/bookings, /my/wallet, /my/profile) sits in this frame.
// The sign-in, sign-up and password pages are outside this group and stay frameless.
export default async function CustomerAppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCustomer();
  if (!me) redirect("/my/login");
  return <MyShell name={me.name} email={me.email}>{children}</MyShell>;
}
