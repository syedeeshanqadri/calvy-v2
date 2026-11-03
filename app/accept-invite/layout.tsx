import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept invitation | Calvy",
  description: "Set a password to join your team on Calvy.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
