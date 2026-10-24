import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { ArrowLeft, Plus } from "lucide-react";

export const revalidate = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export async function generateStaticParams() {
  const posts = await prisma.post.findMany({ where: { published: true }, select: { slug: true } });
  return posts.map(p => ({ slug: p.slug }));
}

async function getPost(slug: string) {
  return prisma.post.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const post = await getPost(params.slug);
  if (!post) return { title: "Post not found · Calvy" };

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || `${post.title} — the Calvy blog.`;
  const url = `${APP_URL}/blog/${post.slug}`;

  return {
    title: `${title} · Calvy`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      authors: [post.authorName],
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title,
      description,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getPost(params.slug);
  if (!post) notFound();

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "section";

  // Render + inject anchor ids on H2s, and collect the table of contents.
  const toc: { id: string; text: string }[] = [];
  const html = (await marked.parse(post.content)).replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    const id = slugify(text);
    toc.push({ id, text });
    return `<h2 id="${id}">${inner}</h2>`;
  });

  let faq: { q: string; a: string }[] = [];
  try {
    const parsed = JSON.parse(post.faq);
    if (Array.isArray(parsed)) faq = parsed.filter((x: { q?: string; a?: string }) => x && x.q && x.a);
  } catch {}

  const url = `${APP_URL}/blog/${post.slug}`;

  const graph: object[] = [{
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.coverImage || undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Organization", name: post.authorName },
    publisher: { "@type": "Organization", name: "Calvy", logo: { "@type": "ImageObject", url: `${APP_URL}/calvy.svg` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  }];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  return (
    <main className="bg-white min-h-screen">
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="pt-28 sm:pt-32 pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-[#6b6b80] hover:text-sky-600 mb-8">
            <ArrowLeft size={16} /> All posts
          </Link>

          {post.tags && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                <span key={t} className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full">{t}</span>
              ))}
            </div>
          )}

          <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-[#0f0f1a] leading-tight mb-4">{post.title}</h1>
          <p className="text-sm text-[#9b9b9b] mb-8">
            By {post.authorName}{post.publishedAt ? ` · ${fmtDate(post.publishedAt)}` : ""}
          </p>

          {post.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImage} alt={post.title} className="w-full rounded-2xl mb-10 border border-[#e8e6e0]" />
          )}

          {/* Table of contents */}
          {toc.length >= 2 && (
            <nav className="mb-10 rounded-2xl border border-[#e8e6e0] bg-[#f8f7f4] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9b9b9b] mb-3">On this page</p>
              <ul className="space-y-2">
                {toc.map(t => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="text-sm text-[#3d3d4d] hover:text-sky-600 transition-colors">{t.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div
            className="text-[16px] leading-relaxed text-[#3d3d4d]
              [&_h2]:font-syne [&_h2]:font-bold [&_h2]:text-2xl [&_h2]:text-[#0f0f1a] [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24
              [&_h3]:font-syne [&_h3]:font-semibold [&_h3]:text-xl [&_h3]:text-[#0f0f1a] [&_h3]:mt-8 [&_h3]:mb-2
              [&_p]:mb-5
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-5 [&_ul]:space-y-2
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-5 [&_ol]:space-y-2
              [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2
              [&_blockquote]:border-l-4 [&_blockquote]:border-sky-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#6b6b80] [&_blockquote]:my-6
              [&_img]:rounded-xl [&_img]:my-6
              [&_code]:bg-[#f3f4f6] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[14px]
              [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_pre]:bg-[#0f0f1a] [&_pre]:text-white [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-6
              [&_strong]:text-[#0f0f1a] [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* FAQ (rendered + FAQPage schema above) */}
          {faq.length > 0 && (
            <section className="mt-12 pt-8 border-t border-[#e8e6e0]">
              <h2 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-5">Frequently asked questions</h2>
              <div className="space-y-3">
                {faq.map((f, i) => (
                  <details key={i} className="group rounded-2xl border border-[#e8e6e0] bg-white px-5 py-4">
                    <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-[#0f0f1a]">
                      {f.q}
                      <Plus size={18} className="text-sky-600 flex-shrink-0 transition-transform group-open:rotate-45" />
                    </summary>
                    <p className="text-[15px] text-[#6b6b80] leading-relaxed mt-3">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <div className="mt-12 pt-8 border-t border-[#e8e6e0]">
            <Link href="/signup" className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
              Start free with Calvy
            </Link>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
