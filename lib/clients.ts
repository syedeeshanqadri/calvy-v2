import type { Prisma, PrismaClient } from "@prisma/client";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ClientContact {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface FindOrCreateOptions {
  /**
   * Owner-entered details are trusted: a phone match is enough, and a match
   * gains whichever contact detail it was missing. Public bookings leave this
   * off, so a stranger cannot attach their email or phone to someone else's
   * record by quoting that person's number.
   */
  trusted?: boolean;
}

/**
 * Find the client a booking belongs to, or create one. Matches by normalised
 * phone first, then by email (case-insensitive), inside one business. Public
 * input only matches by phone when the email agrees (or one side has none) and
 * never edits the record. Phones are stored as E.164 and never as "", so the
 * (businessId, phone) unique index holds.
 */
export async function findOrCreateClient(
  db: Db,
  businessId: string,
  contact: ClientContact,
  tz?: string | null,
  opts: FindOrCreateOptions = {},
) {
  const phone = normalizePhone(contact.phone, tz);
  const email = tryNormalizeEmail(contact.email) || null;
  let phoneTaken = false;

  const find = async () => {
    if (phone) {
      const byPhone = await db.client.findFirst({ where: { businessId, phone } });
      if (byPhone) {
        if (opts.trusted || !email || !byPhone.email || byPhone.email.toLowerCase() === email) return byPhone;
        phoneTaken = true; // someone else's number: do not link, do not reuse it
      }
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
    if (!opts.trusted) return existing;
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
    return await db.client.create({ data: { businessId, name: contact.name, email, phone: phoneTaken ? null : phone } });
  } catch (err) {
    // Lost a race with a concurrent booking for the same person.
    const again = await find();
    if (again) return again;
    throw err;
  }
}
