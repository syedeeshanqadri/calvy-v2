// Phase 1 of the premium landing redesign: collects free-licence photo CANDIDATES for the six scenes, for India and International,
// from the OFFICIAL Pexels and Unsplash APIs (no scraping), converts them to WebP (max 2000px), and writes CREDITS.md and a
// numbered contact sheet to pick from.
//
//   PEXELS_API_KEY=...  UNSPLASH_ACCESS_KEY=...   (free keys: pexels.com/api, unsplash.com/developers; put them in .env.local)
//   npm run photos:candidates                 all scenes, both regions, 3 candidates per scene
//   npm run photos:candidates -- --dry        print the searches only
//   npm run photos:candidates -- --scene=1    one scene
//
// Output: public/marketing/photos/{india,intl}/<scene>-<n>.webp, public/marketing/photos/CREDITS.md, /tmp/photo-picks.html
// Freepik is not used: its free licence requires attribution and its API gives file downloads only to paid plans.
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PEXELS = process.env.PEXELS_API_KEY;
const UNSPLASH = process.env.UNSPLASH_ACCESS_KEY;
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.find((a) => a.startsWith("--scene="))?.split("=")[1];
const PER_SCENE = 3;
const OUT = "public/marketing/photos";

const LOOK = "natural light bright modern";
const SCENES = [
  { n: 1, slug: "hero-doctor", what: "woman doctor at a bright modern clinic reception using a phone", in: "indian woman doctor clinic reception phone", intl: "woman doctor clinic reception using phone bright" },
  { n: 2, slug: "salon", what: "stylist styling a client in a premium salon", in: "indian hair stylist client premium salon", intl: "hair stylist client premium salon natural light" },
  { n: 3, slug: "trainer", what: "trainer coaching a client in a sunlit studio", in: "indian personal trainer coaching client studio", intl: "personal trainer coaching client sunlit studio" },
  { n: 4, slug: "advisor", what: "lawyer or consultant with a client in a calm modern office", in: "indian lawyer consultant client modern office", intl: "lawyer consultant meeting client calm modern office" },
  { n: 5, slug: "at-home", what: "person relaxed at home checking their phone", in: "indian woman relaxing at home looking at phone", intl: "person relaxing at home looking at phone sofa" },
  { n: 6, slug: "team", what: "small team behind a reception desk", in: "indian small team reception desk smiling", intl: "small team reception desk smiling" },
] as const;

interface Candidate { source: "Pexels" | "Unsplash"; id: string; author: string; authorUrl: string; pageUrl: string; imageUrl: string; downloadHook?: string; alt: string; license: string; attribution: string }

async function pexels(q: string, n: number): Promise<Candidate[]> {
  if (!PEXELS) return [];
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(`${q} ${LOOK}`)}&per_page=${n}&orientation=landscape`, { headers: { Authorization: PEXELS } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const j = (await r.json()) as { photos: { id: number; url: string; photographer: string; photographer_url: string; alt: string; src: { original: string } }[] };
  return j.photos.map((p) => ({ source: "Pexels", id: String(p.id), author: p.photographer, authorUrl: p.photographer_url, pageUrl: p.url, imageUrl: `${p.src.original}?auto=compress&cs=tinysrgb&w=2000`, alt: p.alt, license: "Pexels License (free for commercial use)", attribution: "Not required (appreciated)" }));
}

async function unsplash(q: string, n: number): Promise<Candidate[]> {
  if (!UNSPLASH) return [];
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${n}&orientation=landscape&content_filter=high`, { headers: { Authorization: `Client-ID ${UNSPLASH}` } });
  if (!r.ok) throw new Error(`Unsplash ${r.status}`);
  const j = (await r.json()) as { results: { id: string; alt_description: string | null; urls: { raw: string }; user: { name: string; links: { html: string } }; links: { html: string; download_location: string } }[] };
  return j.results.map((p) => ({ source: "Unsplash", id: p.id, author: p.user.name, authorUrl: p.user.links.html, pageUrl: p.links.html, imageUrl: `${p.urls.raw}&w=2000&q=80&fm=jpg`, downloadHook: p.links.download_location, alt: p.alt_description ?? "", license: "Unsplash License (free for commercial use)", attribution: "Not required (appreciated)" }));
}

async function save(c: Candidate, file: string) {
  const res = await fetch(c.imageUrl);
  if (!res.ok) throw new Error(`download ${res.status} ${c.imageUrl}`);
  // Unsplash asks API users to register each download.
  if (c.downloadHook && UNSPLASH) await fetch(c.downloadHook, { headers: { Authorization: `Client-ID ${UNSPLASH}` } }).catch(() => {});
  await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 76 }).toFile(file);
}

async function main() {
  console.log(`Pexels key: ${PEXELS ? "set" : "MISSING"} · Unsplash key: ${UNSPLASH ? "set" : "MISSING"}${DRY ? " · dry run" : ""}`);
  if (!DRY && !PEXELS && !UNSPLASH) throw new Error("Set PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY (free keys) in .env.local.");
  const rows: { region: "india" | "intl"; scene: (typeof SCENES)[number]; num: number; file: string; c: Candidate }[] = [];
  for (const region of ["india", "intl"] as const) {
    mkdirSync(join(OUT, region), { recursive: true });
    for (const scene of SCENES) {
      if (ONLY && String(scene.n) !== ONLY) continue;
      const q = region === "india" ? scene.in : scene.intl;
      console.log(`${region} scene ${scene.n} (${scene.what}): "${q}"`);
      if (DRY) continue;
      // Two from each source, trimmed to three, so the choice is not one site's taste.
      const found = [...(await pexels(q, 2)), ...(await unsplash(q, 2))].slice(0, PER_SCENE + 1).slice(0, PER_SCENE);
      for (const [i, c] of found.entries()) {
        const file = join(OUT, region, `${scene.n}-${scene.slug}-${i + 1}.webp`);
        if (!existsSync(file)) await save(c, file);
        rows.push({ region, scene, num: i + 1, file, c });
      }
    }
  }
  if (DRY) return;
  const credits = ["# Photo credits", "", "Candidates collected by `npm run photos:candidates` from the official Pexels and Unsplash APIs. Only photos that are picked are kept; this file is trimmed to them.", "",
    "| File | Source | Author | Page | Licence | Attribution needed |", "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.file.replace("public/marketing/photos/", "")} | ${r.c.source} | [${r.c.author}](${r.c.authorUrl}) | ${r.c.pageUrl} | ${r.c.license} | ${r.c.attribution} |`), ""];
  writeFileSync(join(OUT, "CREDITS.md"), credits.join("\n"));
  const abs = (f: string) => `file://${process.cwd()}/${f}`;
  const sheet = `<!doctype html><meta charset="utf-8"><title>Photo picks</title><style>body{font:14px system-ui;background:#faf7f2;margin:24px}h2{margin:32px 0 8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}figure{margin:0}img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;display:block}b{font-size:20px}</style><h1>Photo picks</h1>${(["india", "intl"] as const).map((region) => `<h1>${region === "india" ? "India" : "International"}</h1>${SCENES.map((s) => `<h2>Scene ${s.n}: ${s.what}</h2><div class="g">${rows.filter((r) => r.region === region && r.scene.n === s.n).map((r) => `<figure><img src="${abs(r.file)}" alt=""><figcaption><b>${s.n}${region === "india" ? "I" : "W"}${r.num}</b> · ${r.c.source} · ${r.c.author}</figcaption></figure>`).join("")}</div>`).join("")}`).join("")}`;
  writeFileSync("/tmp/photo-picks.html", sheet);
  console.log(`\n${rows.length} candidates saved. Contact sheet: /tmp/photo-picks.html`);
}
main().catch((e) => { console.error(e); process.exit(1); });
