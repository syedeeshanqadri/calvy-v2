import { redirect } from "next/navigation";
import { adminState } from "@/lib/admin/auth";
import TwoFactorClient from "./TwoFactorClient";

export const dynamic = "force-dynamic";

export default async function AdminTwoFactorPage() {
  const st = await adminState();
  if (st.state === "ok") redirect("/admin");
  // "none" is already a 404 in the layout.
  return <TwoFactorClient enrolled={st.state === "needs2fa" && st.enrolled} email={st.state === "needs2fa" ? st.user.email : ""} />;
}
