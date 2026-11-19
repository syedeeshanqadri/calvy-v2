// The member price for a customer who is not signed in: a masked hint at checkout, and a sign-in link emailed on request (no password).
//  - memberHintFor: says only THAT a member price exists and a masked first name. Never the level, the fee or the full name.
//  - requestMemberLink: for an existing customer with a level above Starter only; the email always goes to the customer's own address.
//  - consumeMemberLink: single-use, 15 minutes; clicking it proves the mailbox, so it also verifies the customer's email.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth-tokens";
import { usesTenantSubdomains } from "@/lib/siteBase";
import { identityKey } from "@/lib/rewards/rules";
import { currentLevel, getLevelConfig } from "@/lib/rewards/levelService";

type Db = Prisma.TransactionClient | typeof prisma;

export const MEMBER_LINK_PURPOSE = "member-link";
export const MEMBER_LINK_TTL_MS = 15 * 60_000;

/** "Asha Rao" -> "A***". One letter and stars: enough to recognise yourself, not enough to identify someone else. */
export function maskName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const ch = Array.from(first)[0];
  return ch ? `${ch.toUpperCase()}***` : "a member";
}

async function isMember(db: Db, email: string, now: Date): Promise<boolean> {
  const identity = identityKey({ email });
  if (!identity) return false;
  return (await currentLevel(db, identity, await getLevelConfig(db), now)) !== "STARTER";
}

/** Is there a member price for this email, and what masked name to show? Null for anyone without a level above Starter. */
export async function memberHintFor(db: Db, emailInput: string, now = new Date()): Promise<{ maskedName: string } | null> {
  const email = tryNormalizeEmail(emailInput);
  if (!email || !(await isMember(db, email, now))) return null;
  const customer = await db.customer.findUnique({ where: { email }, select: { name: true } });
  if (customer) return { maskedName: maskName(customer.name) };
  const client = await db.client.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { name: true } });
  return { maskedName: maskName(client?.name) };
}

/** Where the emailed link opens: on the business's own host (so the remembered-device cookie lands there), or the root host elsewhere. */
export function memberLinkUrl(i: { slug: string; token: string; service?: string | null; rootDomain: string }): string {
  const root = i.rootDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const origin = usesTenantSubdomains(root) ? `https://${i.slug}.${root}` : /^(localhost|127\.|\d{1,3}(\.\d{1,3}){3})/.test(root) ? `http://${root}` : `https://${root}`;
  const q = new URLSearchParams({ token: i.token, business: i.slug });
  if (i.service) q.set("service", i.service);
  return `${origin}/api/customer/member-link/open?${q.toString()}`;
}

export type MemberLinkRequest = { send: { to: string; name: string; url: string } | null };

/** Create the link for an existing member. Returns null `send` (and creates nothing) for anyone else; the caller answers the same either way. */
export async function requestMemberLink(db: Db, i: { email: string; businessSlug: string; service?: string | null; rootDomain: string; now?: Date }): Promise<MemberLinkRequest> {
  const now = i.now ?? new Date();
  const email = tryNormalizeEmail(i.email);
  if (!email) return { send: null };
  const customer = await db.customer.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  const business = await db.business.findUnique({ where: { slug: i.businessSlug }, select: { slug: true } });
  if (!customer || !business || !(await isMember(db, email, now))) return { send: null };
  const token = generateToken();
  await db.customerToken.create({ data: { customerId: customer.id, purpose: MEMBER_LINK_PURPOSE, tokenHash: hashToken(token), expiresAt: tokenExpiry(MEMBER_LINK_TTL_MS, now) } });
  return { send: { to: customer.email, name: customer.name, url: memberLinkUrl({ slug: business.slug, token, service: i.service, rootDomain: i.rootDomain }) } };
}

/** Redeem a link once. Marks the customer's email verified (they just proved the mailbox). Null when unknown, used or expired. */
export async function consumeMemberLink(db: Db, token: string, now = new Date()): Promise<{ customerId: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rec = await db.customerToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.purpose !== MEMBER_LINK_PURPOSE || rec.usedAt !== null || rec.expiresAt.getTime() <= now.getTime()) return null;
  // Conditional update: two clicks at once cannot both redeem it.
  const used = await db.customerToken.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now } });
  if (used.count !== 1) return null;
  await db.customer.updateMany({ where: { id: rec.customerId, emailVerified: null }, data: { emailVerified: now } });
  return { customerId: rec.customerId };
}
