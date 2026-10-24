/** Quote a CSV field; neutralise spreadsheet formulas (=, +, -, @) in free text. */
export function csvCell(value: string | number | null | undefined, opts: { phone?: boolean } = {}): string {
  let v = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v) && !(opts.phone && /^\+\d+$/.test(v))) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
