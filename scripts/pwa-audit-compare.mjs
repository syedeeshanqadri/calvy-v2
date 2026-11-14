// Before / after counts per issue type.   node scripts/pwa-audit-compare.mjs <AUDIT_OUT>
// "checks" = individual screenshots (route x viewport x state) that hit the issue; "routes" = distinct routes/states affected.
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const load = (phase) => {
  const dir = path.join(OUT, phase);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).flatMap((f) =>
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
};
const tally = (rows) => {
  const t = new Map();
  for (const r of rows) {
    for (const type of new Set((r.issues ?? []).map((i) => i.type))) {
      if (!t.has(type)) t.set(type, { checks: 0, routes: new Set() });
      const e = t.get(type); e.checks++; e.routes.add(`${r.route}${r.state && r.state !== "page" ? ` [${r.state}]` : ""}`);
    }
  }
  return t;
};
const before = load("before"), after = load("after");
const b = tally(before), a = tally(after);
const types = [...new Set([...b.keys(), ...a.keys()])].sort((x, y) => (b.get(y)?.checks ?? 0) - (b.get(x)?.checks ?? 0));
const pad = (s, n) => String(s).padEnd(n);
const lines = [
  `# PWA audit: before vs after`,
  `before: ${before.length} checks, ${before.filter((r) => r.issues?.length).length} with issues | after: ${after.length} checks, ${after.filter((r) => r.issues?.length).length} with issues`,
  "",
  `${pad("issue type", 40)}${pad("before checks", 15)}${pad("after checks", 14)}${pad("before routes", 15)}after routes`,
  ...types.map((t) => `${pad(t, 40)}${pad(b.get(t)?.checks ?? 0, 15)}${pad(a.get(t)?.checks ?? 0, 14)}${pad(b.get(t)?.routes.size ?? 0, 15)}${a.get(t)?.routes.size ?? 0}`),
  "",
  "## Still open after the fixes (routes)",
  ...types.filter((t) => a.get(t)).flatMap((t) => [`- ${t}: ${[...a.get(t).routes].slice(0, 8).join(", ")}${a.get(t).routes.size > 8 ? ` (+${a.get(t).routes.size - 8} more)` : ""}`]),
];
fs.writeFileSync(path.join(OUT, "compare.md"), lines.join("\n"));
console.log(lines.join("\n"));
