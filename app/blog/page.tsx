import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const revalidate = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export const metadata: Metadata = {
  title: "Blog · Calvy",
  description: "Guides, tips, and playbooks for service businesses — bookings, payments, retention, and growth.",
  alternates: { canonical: `${APP_URL}/blog` },
  openGraph: {
    title: "Calvy Blog",
    description: "Guides and playbooks for service businesses.",
    url: `${APP_URL}/blog`,
    type: "website",
  },
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  // Build must not depend on the database: an unreachable DB at build time yields an empty
  // list that the 60s ISR revalidation replaces on the first real request.
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
  }).catch((e) => {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw e;
    return [];
  });

  return (
    <main className="bg-[#f8f7f4] min-h-screen">
      <Navbar />

      <section className="pt-28 sm:pt-32 pb-12 bg-white border-b border-[#e8e6e0]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-5">Blog</span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl tracking-tight text-[#0f0f1a] mb-3">
            The Calvy blog
          </h1>
          <p className="text-lg text-[#6b6b80] max-w-xl">
            Guides, tips, and playbooks to help your service business get more bookings and fewer no-shows.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {posts.length === 0 ? (
          <p className="text-center text-[#6b6b80] py-16">No posts yet — check back soon.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(p => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="group bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden hover:shadow-lg hover:border-sky-200 transition-all flex flex-col">
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverImage} alt={p.title} loading="lazy" className="aspect-[16/9] w-full object-cover bg-gray-100" />
                ) : (
                  <div className="aspect-[16/9] bg-gradient-to-br from-sky-500 to-sky-600" />
                )}
                <div className="p-5 flex-1 flex flex-col">
                  {p.tags && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.tags.split(",").map(t => t.trim()).filter(Boolean).slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                  <h2 className="font-syne font-bold text-lg text-[#0f0f1a] leading-snug group-hover:text-sky-700 transition-colors">{p.title}</h2>
                  {p.excerpt && <p className="text-sm text-[#6b6b80] mt-2 line-clamp-3 flex-1">{p.excerpt}</p>}
                  <p className="text-xs text-[#9b9b9b] mt-4">{p.authorName} · {p.publishedAt ? fmtDate(p.publishedAt) : ""}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
