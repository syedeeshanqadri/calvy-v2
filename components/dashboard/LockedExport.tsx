import Link from "next/link";
import { Download, Lock } from "lucide-react";

const HINT = "CSV export is on paid plans. Upgrade to download.";

/**
 * The CSV button when the plan does not include it (shown only while plan enforcement is on; with it
 * off every plan has CSV export, so this never appears). Locked: it downloads nothing.
 */
export function LockedExport({ upgradeHref, compact }: { upgradeHref: string | null; compact?: boolean }) {
  const body = (
    <>
      <Lock size={13} aria-hidden />
      {compact ? <Download size={14} aria-hidden /> : <span>Export CSV</span>}
    </>
  );
  const cls = compact
    ? "h-9 px-3 rounded-xl border border-dashed border-[#e8e6e0] bg-white text-[#9a98a8] flex items-center gap-1.5 text-sm"
    : "text-xs font-medium text-[#9a98a8] inline-flex items-center gap-1.5";
  return upgradeHref ? (
    <Link href={upgradeHref} className={cls} title={HINT} aria-label={`Download CSV (locked). ${HINT}`}>{body}</Link>
  ) : (
    <span className={cls} title={HINT} role="img" aria-label={`Download CSV (locked). ${HINT}`}>{body}</span>
  );
}
