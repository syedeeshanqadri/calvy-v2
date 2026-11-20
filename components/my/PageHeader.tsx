/** Title block at the top of every customer screen. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 lg:mb-8">
      <h1 className="font-display font-bold text-3xl text-cv-ink lg:text-4xl">{title}</h1>
      {subtitle && <p className="text-sm text-cv-mute mt-1">{subtitle}</p>}
    </header>
  );
}
