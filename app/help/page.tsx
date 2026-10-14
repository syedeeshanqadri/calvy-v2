import type { Metadata } from "next";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/lib/helpArticles";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { HelpSearch } from "./HelpSearch";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export const metadata: Metadata = {
  title: "Help Center · Calvy",
  description: "Guides and answers for Calvy — bookings, billing, Razorpay payments, payouts, and more. Search 24+ help articles.",
  alternates: { canonical: `${APP_URL}/help` },
};

export default function HelpPage() {
  // Lightweight client search index (full-text across title, excerpt, keywords, body).
  const index = HELP_ARTICLES.map(a => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    excerpt: a.excerpt,
    text: `${a.title} ${a.excerpt} ${a.keywords.join(" ")} ${a.body}`.toLowerCase(),
  }));

  return (
    <main className="bg-[#f8f7f4] min-h-screen">
      <Navbar />
      <HelpSearch index={index} categories={[...HELP_CATEGORIES]} />
      <Footer />
    </main>
  );
}
