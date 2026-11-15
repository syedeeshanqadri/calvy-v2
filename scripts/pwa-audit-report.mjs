// Groups pwa-audit results per route and issue type.   node scripts/pwa-audit-report.mjs <AUDIT_OUT> [before|after]
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const PHASE = process.argv[3] ?? "before";
const dir = path.join(OUT, PHASE);
const rows = fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).flatMap((f) =>
  fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

const byRoute = new Map();
for (const r of rows) {
  const key = r.state && r.state !== "page" ? `${r.route}  [${r.state}]` : r.route;
  if (!byRoute.has(key)) byRoute.set(key, new Map());
  for (const i of r.issues ?? []) {
    const m = byRoute.get(key);
    if (!m.has(i.type)) m.set(i.type, { vps: new Set(), personas: new Set(), example: i.detail });
    const e = m.get(i.type); e.vps.add(r.vp); e.personas.add(r.persona);
  }
}
const total = rows.length;
const withIssues = rows.filter((r) => (r.issues ?? []).length).length;
const lines = [`# PWA audit (${PHASE})`, `${total} checks, ${withIssues} with issues`, ""];
const typeTotals = new Map();
for (const [route, types] of [...byRoute].sort()) {
  if (!types.size) continue;
  lines.push(`## ${route}`);
  for (const [t, e] of [...types].sort()) {
    typeTotals.set(t, (typeTotals.get(t) ?? 0) + 1);
    lines.push(`- **${t}** (${e.vps.size} viewports; ${[...e.personas].join(",")}): ${e.example}`);
  }
  lines.push("");
}
lines.splice(3, 0, "Issue types: " + [...typeTotals].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", "), "");
const redirects = rows.filter((r) => r.note?.startsWith("redirected")).map((r) => `${r.persona} ${r.route} -> ${r.url}`);
if (redirects.length) lines.push("## Redirects (filtered nav)", ...[...new Set(redirects)].map((x) => `- ${x}`), "");
const errors = rows.filter((r) => r.state === "error");
if (errors.length) lines.push("## Errors", ...errors.slice(0, 20).map((r) => `- ${r.persona} ${r.vp} ${r.route}: ${r.issues[0]?.detail}`));
fs.writeFileSync(path.join(dir, "report.md"), lines.join("\n"));
console.log(lines.slice(0, 6).join("\n"));
console.log(`full report: ${path.join(dir, "report.md")}`);
