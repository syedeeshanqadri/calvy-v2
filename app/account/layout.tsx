import type { Metadata } from "next";

export const viewport = { themeColor: "#0f0f1a" };

// Customer account pages are private: never indexed.
export const metadata: Metadata = {
  title: "My bookings",
  robots: { index: false, follow: false },
};

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
