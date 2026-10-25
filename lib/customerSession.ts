import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerIdOf } from "@/lib/customerAccess";

/**
 * The signed-in customer, from the database (never from the token alone), or null for guests,
 * owners and deleted accounts. `verified` says whether bookings may be shown.
 */
export async function getCustomer() {
  const session = await getServerSession(authOptions);
  const id = customerIdOf({ kind: session?.user?.kind, customerId: session?.user?.customerId });
  if (!id) return null;
  const c = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true, email: true, emailVerified: true } });
  return c ? { ...c, verified: !!c.emailVerified } : null;
}
export type SessionCustomer = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
