import type { Metadata } from "next";
import { appManifestMetadata } from "@/lib/appMetadata";

export const viewport = {
  themeColor: "#0f0f1a",
};

// Auth pages shouldn't be indexed — they're thin, gated, and not search targets.
export const metadata: Metadata = {
  ...appManifestMetadata,
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
