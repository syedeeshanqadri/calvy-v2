// Lists (and optionally clears) image records whose file cannot be served. Read-only unless --clear is given.
//   npm run images:check              list them, grouped by business: the owner re-uploads these
//   npm run images:check -- --clear   also empty the broken fields (logo, staff photo, service image, website photos), so the
//                                     dashboard shows "no image" and the owner can upload a new one. WRITES to DATABASE_URL.
//
// Broken = a local-disk path ("/uploads/...", a file that only exists on a developer machine), or an https URL that answers 4xx/5xx.
import { PrismaClient } from "@prisma/client";
import { isLocalUploadUrl, stripFlaggedImages } from "../lib/images";

const prisma = new PrismaClient();
const CLEAR = process.argv.includes("--clear");

interface Rec { slug: string; where: string; url: string; clear?: () => Promise<void> }

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return r.status < 400;
  } catch { return false; }
}

const IMAGE_STRING = /^\/uploads\/|^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?|$)|blob\.vercel-storage\.com/i;

async function main() {
  const host = (process.env.DATABASE_URL ?? "").match(/@([^/:?]+)/)?.[1] ?? "unknown host";
  console.log(`${CLEAR ? "Checking and CLEARING" : "Checking"} image records on ${host}\n`);
  const recs: Rec[] = [];
  const sites = new Map<string, { slug: string; cfg: unknown }>(); // businessId -> parsed website config

  for (const b of await prisma.business.findMany({ select: { id: true, slug: true, logoUrl: true, websiteJson: true } })) {
    if (b.logoUrl) recs.push({ slug: b.slug, where: "logo", url: b.logoUrl, clear: async () => { await prisma.business.update({ where: { id: b.id }, data: { logoUrl: null } }); } });
    let cfg: unknown = null;
    try { cfg = JSON.parse(b.websiteJson ?? "null"); } catch { /* not JSON: nothing to check */ }
    if (!cfg) continue;
    sites.set(b.id, { slug: b.slug, cfg });
    const walk = (o: unknown, path: string) => {
      if (typeof o === "string") { if (IMAGE_STRING.test(o)) recs.push({ slug: b.slug, where: `website${path}`, url: o }); }
      else if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(cfg, "");
  }
  for (const s of await prisma.service.findMany({ where: { imageUrl: { not: null } }, select: { id: true, name: true, imageUrl: true, business: { select: { slug: true } } } }))
    recs.push({ slug: s.business.slug, where: `service "${s.name}"`, url: s.imageUrl!, clear: async () => { await prisma.service.update({ where: { id: s.id }, data: { imageUrl: null } }); } });
  for (const s of await prisma.staff.findMany({ where: { photoUrl: { not: null } }, select: { id: true, name: true, photoUrl: true, business: { select: { slug: true } } } }))
    recs.push({ slug: s.business.slug, where: `staff "${s.name}"`, url: s.photoUrl!, clear: async () => { await prisma.staff.update({ where: { id: s.id }, data: { photoUrl: null } }); } });

  const broken: Rec[] = [];
  for (const r of recs) {
    if (isLocalUploadUrl(r.url)) broken.push(r);
    else if (/^https?:\/\//i.test(r.url) && !(await reachable(r.url))) broken.push(r);
  }
  const bySlug = new Map<string, Rec[]>();
  for (const r of broken) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r]);
  console.log(`${recs.length} image records checked, ${broken.length} broken in ${bySlug.size} business(es).\n`);
  for (const [slug, list] of bySlug) {
    console.log(slug);
    for (const r of list) console.log(`  ${r.where.padEnd(34)} ${r.url}`);
  }
  if (!broken.length) return;
  if (!CLEAR) { console.log("\nNothing changed. Re-run with --clear to empty these fields, or let owners re-upload over them."); return; }
  for (const r of broken) if (r.clear) await r.clear();
  for (const [id, site] of sites) {
    const flagged = new Set(broken.filter((r) => r.slug === site.slug && r.where.startsWith("website")).map((r) => r.url));
    if (flagged.size) await prisma.business.update({ where: { id }, data: { websiteJson: JSON.stringify(stripFlaggedImages(site.cfg, flagged)) } });
  }
  console.log("\nCleared. Owners can now upload new images.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
