import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { loadTracking } from "@/lib/trackingDb";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { TrackClient } from "./TrackClient";

export const dynamic = "force-dynamic";

// A private link: never indexed, and the code is not leaked to other sites through the referrer.
export const metadata: Metadata = {
  title: "Your place in line",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TrackPage(props: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await props.params;

  const h = await headers();
  const limit = await rateLimit(`track:${clientIp(new Request("http://local", { headers: h }))}`, 120, 60_000);
  if (!limit.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#f8f7f4]">
        <p className="text-center text-[#6b6b80]">Too many requests. Please wait a minute and refresh.</p>
      </main>
    );
  }

  const page = await loadTracking(code, slug);
  if (!page) notFound();
  return <TrackClient code={code} initial={page} />;
}
