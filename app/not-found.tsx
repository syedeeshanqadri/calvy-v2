import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage, statusPrimaryLink, statusSecondaryLink } from "@/components/ui/StatusPage";

export const metadata: Metadata = { title: "Page not found · Calvy" };

export default function NotFound() {
  return (
    <StatusPage
      title="We can't find that page"
      description="The link may be wrong or the page may have moved. Check the address, or head back home."
    >
      <Link href="/" className={statusPrimaryLink}>Go to home</Link>
      <Link href="/login" className={statusSecondaryLink}>Sign in</Link>
    </StatusPage>
  );
}
