import { Video } from "lucide-react";

/** "Online" marker for an appointment row (staff views only). */
export function OnlineBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full ${className}`}>
      <Video size={11} aria-hidden />Online
    </span>
  );
}

/** Opens the meeting link for staff. Without a link it says so, so the owner knows to add one. */
export function JoinButton({ url, size = "sm" }: { url: string | null | undefined; size?: "sm" | "md" }) {
  const pad = size === "md" ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs";
  if (!url) {
    return <span className={`inline-flex items-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-medium ${pad}`}>No link set</span>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 ${pad}`}>
      <Video size={size === "md" ? 14 : 12} aria-hidden />Join
    </a>
  );
}
