import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export function LegalLayout({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-[#f8f7f4] min-h-screen">
      <Navbar />

      <section className="pt-32 pb-12 border-b border-[#e8e6e0] bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-[#0f0f1a] mb-3">{title}</h1>
          <p className="text-sm text-[#8a8a99]">Last updated: {lastUpdated}</p>
          {intro && <p className="mt-5 text-[15px] leading-relaxed text-[#4b4b5a]">{intro}</p>}
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className="space-y-4 text-[15px] leading-relaxed text-[#4b4b5a]
            [&_h2]:font-syne [&_h2]:font-bold [&_h2]:text-xl [&_h2]:text-[#0f0f1a] [&_h2]:mt-10 [&_h2]:mb-3
            [&_h3]:font-semibold [&_h3]:text-[#0f0f1a] [&_h3]:mt-6 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2
            [&_strong]:text-[#0f0f1a] [&_strong]:font-semibold
            [&_a]:text-accent [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2"
        >
          {children}
        </div>
      </article>

      <Footer />
    </main>
  );
}
