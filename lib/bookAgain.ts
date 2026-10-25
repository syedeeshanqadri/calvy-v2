// "Schedule another appointment": remember who just booked (this browser tab only) so the next
// booking can start with their details filled in. Nothing personal goes in the URL.
export interface BookerDetails { name: string; email: string; phone: string }

const key = (slug: string) => `calvy:booker:${slug}`;

export function saveBooker(slug: string, d: BookerDetails): void {
  try {
    sessionStorage.setItem(key(slug), JSON.stringify(d));
  } catch {
    // Private mode or blocked storage: the form simply starts empty.
  }
}

export function loadBooker(slug: string): BookerDetails | null {
  try {
    const raw = sessionStorage.getItem(key(slug));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<BookerDetails>;
    return typeof d.email === "string" ? { name: String(d.name ?? ""), email: d.email, phone: String(d.phone ?? "") } : null;
  } catch {
    return null;
  }
}

export type AgainMode = "same" | "other";
export const parseAgain = (v: string | null | undefined): AgainMode | null => (v === "same" || v === "other" ? v : null);
