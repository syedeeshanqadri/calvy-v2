/**
 * One-time migration: remove the random 5-char suffix from existing business slugs.
 *
 * Old format: "pearls-dental-clinic-lrjgp"  (last segment = 5 random [a-z0-9] chars)
 * New format: "pearls-dental-clinic"
 *
 * Run with:  npx tsx scripts/update-slugs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Matches slugs ending in exactly 5 lowercase alphanumeric chars preceded by a dash
const RANDOM_SUFFIX = /^(.+)-([a-z0-9]{5})$/;

function stripSuffix(slug: string): string | null {
  const m = slug.match(RANDOM_SUFFIX);
  return m ? m[1] : null;
}

async function resolveSlug(base: string, excludeId: string): Promise<string> {
  const taken = await prisma.business.findUnique({ where: { slug: base } });
  if (!taken || taken.id === excludeId) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const t = await prisma.business.findUnique({ where: { slug: candidate } });
    if (!t || t.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function main() {
  const businesses = await prisma.business.findMany({ select: { id: true, slug: true, name: true } });

  const toUpdate = businesses
    .map(b => ({ ...b, base: stripSuffix(b.slug) }))
    .filter((b): b is typeof b & { base: string } => b.base !== null);

  if (toUpdate.length === 0) {
    console.log("No slugs with random suffixes found. Nothing to do.");
    return;
  }

  console.log(`Found ${toUpdate.length} slugs to update:\n`);

  for (const b of toUpdate) {
    const newSlug = await resolveSlug(b.base, b.id);
    if (newSlug === b.slug) {
      console.log(`  SKIP  ${b.slug}  (already clean)`);
      continue;
    }
    await prisma.business.update({ where: { id: b.id }, data: { slug: newSlug } });
    console.log(`  OK    ${b.slug}  →  ${newSlug}`);
  }

  console.log("\nDone.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
