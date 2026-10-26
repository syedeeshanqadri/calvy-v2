import { jsonLdString } from "@/lib/jsonLd";
import { SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { ChevronRight, LifeBuoy, FileText } from "lucide-react";
import { HELP_ARTICLES, getArticle, articlesByCategory } from "@/lib/helpArticles";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export function generateStaticParams() {
  return HELP_ARTICLES.map(a => ({ slug: a.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const a = getArticle(params.slug);
  if (!a) return { title: "Article not found · Calvy Help" };
  const url = `${APP_URL}/help/${a.slug}`;
  return {
    title: `${a.title} · Calvy Help`,
    description: a.excerpt,
    keywords: a.keywords,
    alternates: { canonical: url },
    openGraph: { title: a.title, description: a.excerpt, url, type: "article" },
  };
}

export default async function HelpArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const article = getArticle(params.slug);
  if (!article) notFound();

  const html = await marked.parse(article.body);
  const related = articlesByCategory(article.category).filter(a => a.slug !== article.slug).slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: article.title,
      acceptedAnswer: { "@type": "Answer", text: article.excerpt },
    }],
  };

  return (
    <main className="bg-white min-h-screen">
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[#6b6b80] mb-7 flex-wrap">
          <Link href="/help" className="hover:text-sky-600">Help Center</Link>
          <ChevronRight size={14} className="text-[#c5c3bf]" />
          <span className="text-[#9b9b9b]">{article.category}</span>
        </nav>

        <span className="inline-block text-xs font-bold tracking-widest uppercase text-sky-700 bg-sky-50 px-3 py-1 rounded-full mb-4">{article.category}</span>
        <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-[#0f0f1a] leading-tight mb-3">{article.title}</h1>
        <p className="text-lg text-[#6b6b80] mb-10">{article.excerpt}</p>

        <article
          className="text-[16px] leading-relaxed text-[#3d3d4d]
            [&_h2]:font-syne [&_h2]:font-bold [&_h2]:text-xl [&_h2]:text-[#0f0f1a] [&_h2]:mt-9 [&_h2]:mb-3
            [&_h3]:font-semibold [&_h3]:text-[#0f0f1a] [&_h3]:mt-6 [&_h3]:mb-2
            [&_p]:mb-4
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1.5
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-1.5
            [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2
            [&_strong]:text-[#0f0f1a] [&_strong]:font-semibold
            [&_blockquote]:border-l-4 [&_blockquote]:border-sky-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#6b6b80] [&_blockquote]:my-5
            [&_code]:bg-[#f3f4f6] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[14px] [&_code]:text-sky-700
            [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:w-full [&_table]:my-5 [&_table]:text-sm [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#0f0f1a] [&_th]:border-b [&_th]:border-[#e8e6e0] [&_th]:py-2 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#f0ede8] [&_td]:align-top [&_td]:pr-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[#e8e6e0]">
            <h2 className="font-syne font-bold text-lg text-[#0f0f1a] mb-4">Related articles</h2>
            <div className="space-y-2">
              {related.map(r => (
                <Link key={r.slug} href={`/help/${r.slug}`} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f8f7f4] transition-colors">
                  <FileText size={15} className="text-sky-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-[#3d3d4d] group-hover:text-sky-700">{r.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="mt-10 bg-[#f8f7f4] rounded-2xl p-5 flex items-center gap-4">
          <LifeBuoy size={22} className="text-sky-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-[#0f0f1a]">Didn&apos;t find your answer?</p>
            <p className="text-xs text-[#6b6b80]">We usually reply within a few hours.</p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm font-semibold text-sky-600 hover:text-sky-700 whitespace-nowrap">Contact support →</a>
        </div>
      </div>

      <Footer />
    </main>
  );
}
