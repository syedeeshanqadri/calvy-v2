"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusPage, statusSecondaryLink } from "@/components/ui/StatusPage";

// Rendered inside AdminLayout (app/admin/layout.tsx), so the admin shell stays visible.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <StatusPage
      layout="inline"
      alert
      title="Something went wrong"
      description="We could not load this admin page. Please try again."
      reference={error.digest}
    >
      <Button onClick={reset} className="min-h-11 w-full sm:w-auto">Try again</Button>
      <Link href="/admin" className={statusSecondaryLink}>Back to admin</Link>
    </StatusPage>
  );
}
