import type { Prisma, PrismaClient } from "@prisma/client";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ClientContact {
  name: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Find the client a booking belongs to, or create one. Matches by normalised
 * phone first, then by email (case-insensitive), inside one business. A match
 * gains whichever contact detail it was missing. Phones are stored as E.164 and
 * never as "", so the (businessId, phone) unique index holds.
 */
export async function findOrCreateClient(db: Db, businessId: string, contact: ClientContact, tz?: string | null) {
  const phone = normalizePhone(contact.phone, tz);
  const email = tryNormalizeEmail(contact.email) || null;

  const find = async () => {
    if (phone) {
      const byPhone = await db.client.findFirst({ where: { businessId, phone } });
      if (byPhone) return byPhone;
    }
    if (email) {
      return (
        (await db.client.findFirst({ where: { businessId, email } })) ??
        (await db.client.findFirst({ where: { businessId, email: { equals: email, mode: "insensitive" } } }))
      );
    }
    return null;
  };

  const existing = await find();
  if (existing) {
    const data: { email?: string; phone?: string } = {};
    if (!existing.email && email) data.email = email;
    if (!existing.phone && phone) data.phone = phone;
    if (Object.keys(data).length === 0) return existing;
    try {
      return await db.client.update({ where: { id: existing.id }, data });
    } catch {
      return existing; // the detail belongs to another client; keep the match as is
    }
  }

  try {
    return await db.client.create({ data: { businessId, name: contact.name, email, phone } });
  } catch (err) {
    // Lost a race with a concurrent booking for the same person.
    const again = await find();
    if (again) return again;
    throw err;
  }
}
