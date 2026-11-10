
// Normalize an FAQ array from request input into a stored JSON string.
export function normalizeFaq(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const items = input
    .map((x) => {
      const o = (x ?? {}) as { q?: unknown; a?: unknown };
      return { q: String(o.q ?? "").trim(), a: String(o.a ?? "").trim() };
    })
    .filter((x) => x.q && x.a)
    .slice(0, 20);
  return JSON.stringify(items);
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "post";
}
