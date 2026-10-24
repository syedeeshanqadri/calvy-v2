"use client";
import { SUPPORT_EMAIL } from "@/lib/site";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, FileText, X, LifeBuoy } from "lucide-react";

interface IndexItem { slug: string; title: string; category: string; excerpt: string; text: string }

export function HelpSearch({ index, categories }: { index: IndexItem[]; categories: string[] }) {
  const [q, setQ] = useState("");

  // Support /help?q=... as a search-results URL (used by the homepage SearchAction).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    const terms = query.split(/\s+/).filter(Boolean);
    return index
      .map(item => {
        let score = 0;
        for (const t of terms) {
          if (!item.text.includes(t)) return null;          // require all terms (AND)
          if (item.title.toLowerCase().includes(t)) score += 3;
          if (item.excerpt.toLowerCase().includes(t)) score += 1;
          score += 1;
        }
        return { item, score };
      })
      .filter((r): r is { item: IndexItem; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item);
  }, [q, index]);

  return (
    <>
      {/* Hero + search */}
      <section className="bg-gradient-to-b from-white to-[#f8f7f4] pt-28 sm:pt-32 pb-12 border-b border-[#e8e6e0]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-5">
            <LifeBuoy size={13} /> Help Center
          </div>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl tracking-tight text-[#0f0f1a] mb-3">
            How can we help?
          </h1>
          <p className="text-lg text-[#6b6b80] mb-8">Search guides on bookings, billing, payments, and Razorpay setup.</p>

          <div className="relative max-w-xl mx-auto">
            <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#9b9b9b]" />
            <input
              aria-label="Search help articles"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search for an answer…"
              className="w-full rounded-2xl border border-[#e8e6e0] bg-white pl-13 pr-12 py-4 text-base shadow-sm focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-[#0f0f1a]">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {results ? (
          /* ── Search results ── */
          <div>
            <p className="text-sm text-[#6b6b80] mb-5">
              {results.length === 0 ? "No results" : `${results.length} result${results.length === 1 ? "" : "s"}`} for &ldquo;{q}&rdquo;
            </p>
            {results.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-[#e8e6e0]">
                <p className="text-[#6b6b80] mb-1">We couldn&apos;t find an article for that.</p>
                <p className="text-sm text-[#9b9b9b]">Try different keywords, or <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sky-600 font-medium underline">email support</a>.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {results.map(a => <ResultRow key={a.slug} a={a} />)}
              </div>
            )}
          </div>
        ) : (
          /* ── Browse by category ── */
          <div className="space-y-10">
            {categories.map(cat => {
              const items = index.filter(a => a.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <h2 className="font-syne font-bold text-xl text-[#0f0f1a] mb-4">{cat}</h2>
                  <div className="space-y-2.5">
                    {items.map(a => <ResultRow key={a.slug} a={a} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Contact CTA */}
        <div className="mt-12 bg-white rounded-2xl border border-[#e8e6e0] p-6 text-center">
          <p className="font-semibold text-[#0f0f1a]">Still need a hand?</p>
          <p className="text-sm text-[#6b6b80] mt-1 mb-4">Our team is happy to help.</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Contact support
          </a>
        </div>
      </section>
    </>
  );
}

function ResultRow({ a }: { a: IndexItem }) {
  return (
    <Link
      href={`/help/${a.slug}`}
      className="group flex items-start gap-3 bg-white rounded-2xl border border-[#e8e6e0] px-5 py-4 hover:border-sky-200 hover:shadow-md transition-all"
    >
      <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <FileText size={16} className="text-sky-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#0f0f1a] group-hover:text-sky-700 transition-colors">{a.title}</p>
        <p className="text-sm text-[#6b6b80] mt-0.5 line-clamp-1">{a.excerpt}</p>
      </div>
      <ArrowRight size={17} className="text-[#c5c3bf] group-hover:text-sky-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-2" />
    </Link>
  );
}
