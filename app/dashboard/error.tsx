"use client";
import { useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { StatusPage, statusSecondaryLink } from "@/components/ui/StatusPage";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard error", error.digest ?? "");
  }, [error]);

  return (
    <DashboardLayout title="Dashboard">
      <StatusPage
        layout="inline"
        alert
        title="Something went wrong"
        description="We could not load this part of your dashboard. Please try again."
        reference={error.digest}
      >
        <Button onClick={reset} className="min-h-11 w-full sm:w-auto">Try again</Button>
        <Link href="/dashboard" className={statusSecondaryLink}>Back to dashboard</Link>
      </StatusPage>
    </DashboardLayout>
  );
}
