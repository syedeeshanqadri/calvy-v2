import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import MagicClient from "./MagicClient";

// A one-time link with a secret in the URL: never indexed, never sent on as a Referer (also set as a header in next.config.mjs).
export const metadata: Metadata = { title: "Sign in | Calvy", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function MagicPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell className="text-center">
      <MagicClient token={typeof token === "string" ? token : ""} />
    </AuthShell>
  );
}
