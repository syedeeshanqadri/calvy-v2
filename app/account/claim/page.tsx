import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ClaimClient from "./ClaimClient";

// A one-time link with a secret in the URL: never indexed, never sent on as a Referer (also set as a header in next.config.mjs).
export const metadata: Metadata = { title: "Your bookings | Calvy", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell className="text-center">
      <ClaimClient token={typeof token === "string" ? token : ""} />
    </AuthShell>
  );
}
