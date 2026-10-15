import type { Metadata } from "next";
import SentryClient from "@/components/providers/SentryClient";
import { Plus_Jakarta_Sans, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/Providers";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io"),
  title: "Calvy — Smart Appointment Booking",
  description: "The smartest appointment booking platform for salons, clinics, coaches, and every service business. Automate bookings, reminders, and payments.",
  keywords: ["appointment booking", "scheduling software", "booking system", "salon software", "clinic booking"],
  // NOTE: no site-wide `alternates.canonical` here — a root-level canonical of "/"
  // is inherited by every child page that doesn't set its own, making them all
  // look like duplicates of the homepage in Google. Each page sets its own canonical.
  openGraph: {
    title: "Calvy — Smart Appointment Booking",
    description: "Book more clients, stress less. Automated scheduling for modern service businesses.",
    url: "/",
    siteName: "Calvy",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Calvy — Smart Appointment Booking", description: "Automated scheduling for modern service businesses." },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Calvy",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f1a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${dmSans.variable}`}>
      <body><Providers>{children}<PWAInstallPrompt /><SentryClient /></Providers><Analytics /></body>
    </html>
  );
}
