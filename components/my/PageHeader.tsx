/** Title block at the top of every customer screen. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 lg:mb-8">
      <h1 className="font-syne font-bold text-2xl lg:text-3xl">{title}</h1>
      {subtitle && <p className="text-sm text-[#6b6b80] mt-1">{subtitle}</p>}
    </header>
  );
}
