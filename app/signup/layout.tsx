import type { Metadata } from "next";

// Auth pages shouldn't be indexed — they're thin, gated, and not search targets.
export const metadata: Metadata = {
  alternates: { canonical: "/signup" },
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
