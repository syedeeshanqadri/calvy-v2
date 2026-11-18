import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonLd";
import { FOR_PAGES, forPageBySlug, forPageCopy } from "@/lib/forPages";

export const dynamicParams = false;
export const generateStaticParams = () => FOR_PAGES.map((p) => ({ pack: p.slug }));

export async function generateMetadata(props: { params: Promise<{ pack: string }> }): Promise<Metadata> {
  const page = forPageBySlug((await props.params).pack);
  if (!page) return {};
  const c = forPageCopy(page);
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: `/for/${page.slug}` },
    openGraph: { title: c.title, description: c.description, url: `/for/${page.slug}`, siteName: "Calvy", type: "website" },
  };
}

export default async function ForPackPage(props: { params: Promise<{ pack: string }> }) {
  const page = forPageBySlug((await props.params).pack);
  if (!page) notFound();
  const c = forPageCopy(page);
  const url = `${SITE_URL}/for/${page.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, url, name: c.title, description: c.description, isPartOf: { "@id": `${SITE_URL}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Calvy", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: `For ${page.what}`, item: url },
      ] },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Navbar />
      <section className="pt-28 sm:pt-32 pb-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-gray-900">{c.h1}</h1>
          <p className="mt-5 text-lg text-gray-600 leading-relaxed">{c.intro}</p>
          <ul className="mt-8 space-y-3">
            {page.points.map((pt) => (
              <li key={pt} className="flex gap-3 text-gray-700 leading-relaxed">
                <Check size={18} className="text-sky-600 mt-1 shrink-0" aria-hidden />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm">Start free</Link>
            <Link href="/pricing" className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl border border-gray-300 text-gray-900 font-semibold text-sm">See pricing</Link>
          </div>
          <p className="mt-8 text-sm text-gray-600">Plans, limits and prices are on the <Link href="/pricing" className="underline">pricing page</Link>. WhatsApp message charges are billed by Meta to your own WhatsApp Business account.</p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
