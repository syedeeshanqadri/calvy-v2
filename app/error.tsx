"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusPage, statusSecondaryLink } from "@/components/ui/StatusPage";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <StatusPage
      alert
      title="Something went wrong"
      description="Sorry, we hit a problem loading this page. Please try again. If it keeps happening, come back in a few minutes."
      reference={error.digest}
    >
      <Button onClick={reset} className="min-h-11 w-full sm:w-auto">Try again</Button>
      <Link href="/" className={statusSecondaryLink}>Go to home</Link>
    </StatusPage>
  );
}
