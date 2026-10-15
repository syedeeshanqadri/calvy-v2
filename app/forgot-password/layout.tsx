import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot password | Calvy",
  description: "Request a link to reset your Calvy password.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
