import Image from "next/image";
import { cn } from "@/lib/utils";

/** Shared class strings so links look like the Button kit (links cannot sit inside <button>). */
export const statusPrimaryLink =
  "inline-flex items-center justify-center min-h-11 w-full sm:w-auto font-dm font-medium text-sm px-6 py-2.5 rounded-full bg-accent text-white hover:bg-accent-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
export const statusSecondaryLink =
  "inline-flex items-center justify-center min-h-11 w-full sm:w-auto font-dm font-medium text-sm px-4 py-2.5 rounded-full text-accent-hover underline underline-offset-4 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

interface StatusPageProps {
  title: string;
  description: string;
  /** Muted small line, for example an error reference. */
  reference?: string;
  /** Announce the message to assistive tech (error states). */
  alert?: boolean;
  /** "screen" fills the viewport on a dark backdrop; "inline" sits inside an existing app shell. */
  layout?: "screen" | "inline";
  children?: React.ReactNode;
}

export function StatusPage({ title, description, reference, alert, layout = "screen", children }: StatusPageProps) {
  // Inside an app shell the header already owns the page <h1>.
  const Heading = layout === "inline" ? "h2" : "h1";
  const card = (
    <div className="w-full max-w-md">
      {layout === "screen" && (
        <div className="flex justify-center mb-8">
          <Image src="/calvy.svg" alt="Calvy" width={120} height={35} className="brightness-0 invert" priority />
        </div>
      )}
      <div className={cn("bg-white rounded-3xl p-6 sm:p-8 text-center", layout === "screen" ? "shadow-2xl" : "border border-[#e8e6e0]")}>
        <Heading className="font-syne font-bold text-2xl text-brand mb-2">{title}</Heading>
        <div role={alert ? "alert" : undefined}>
          <p className="text-sm text-[#6b6b80] leading-relaxed">{description}</p>
        </div>
        {children && <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">{children}</div>}
        {reference && <p className="mt-5 text-xs text-[#6b6b80] break-all">Reference: {reference}</p>}
      </div>
    </div>
  );

  if (layout === "inline") {
    return <div className="flex items-center justify-center p-4 sm:p-8 min-h-[60dvh]">{card}</div>;
  }
  return (
    <main
      className="min-h-dvh bg-brand flex items-center justify-center p-4"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {card}
    </main>
  );
}
