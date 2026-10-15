import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password | Calvy",
  description: "Choose a new password for your Calvy account.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
