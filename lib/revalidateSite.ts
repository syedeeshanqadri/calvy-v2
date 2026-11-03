import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Drop any cached copy of a business's public pages after the owner changes site content. */
export async function revalidateSite(businessId: string) {
  try {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    if (b) { revalidatePath(`/${b.slug}`); revalidatePath(`/${b.slug}/book-now`); }
  } catch {
    // The page is force-dynamic, so a failed revalidation never leaves it stale.
  }
}
