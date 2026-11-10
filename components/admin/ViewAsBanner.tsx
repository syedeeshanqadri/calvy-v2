"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Red bar on every dashboard page while a Calvy admin is viewing a business. One click exits. */
export function ViewAsBanner({ mode, businessName, expiresAt, businessId }: { mode: "READ" | "ACT"; businessName: string; expiresAt: string; businessId: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));

  async function exit() {
    setBusy(true);
    await fetch("/api/admin/view-as/exit", { method: "POST" }).catch(() => {});
    router.replace(businessId ? `/admin/businesses/${businessId}` : "/admin/businesses");
    router.refresh();
  }

  return (
    <div role="alert" className="h-10 bg-red-600 text-white text-sm flex items-center justify-between gap-3 px-4" data-testid="view-as-banner">
      <span className="truncate font-semibold">Viewing as {businessName} — admin{mode === "ACT" ? " (can edit)" : " (read-only)"}</span>
      <span className="hidden sm:inline text-red-100 text-xs">{left > 0 ? `Ends in ${left} min` : "Ending…"}</span>
      <button type="button" onClick={exit} disabled={busy} className="shrink-0 min-h-8 px-3 rounded-lg bg-white text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-60">Exit view-as</button>
    </div>
  );
}
