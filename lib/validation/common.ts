import { z } from "zod";
import { NextResponse } from "next/server";
import { readJsonBody, parseWith } from "@/lib/auth-http";

export const text = (max: number) => z.string().trim().max(max);
export const id = z.string().trim().min(1).max(64);
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address");
/** Loose E.164-ish phone: optional +, digits, spaces, dashes, parentheses. */
export const phoneField = z
  .string()
  .trim()
  .max(30)
  .regex(/^\+?[0-9 ()\-]{6,30}$/, "Invalid phone number");
export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
export const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM");
export const money = z.coerce.number().finite().min(0).max(10_000_000);
export const positiveInt = (max: number) => z.coerce.number().int().min(1).max(max);
export const pageParams = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Treat "" / null as absent for optional text inputs sent by forms. */
export const blankToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

type Parsed<T> = { ok: true; data: T } | { ok: false; res: NextResponse };

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  const body = await readJsonBody(req);
  if (!body.ok) return body;
  const r = parseWith(schema, body.data);
  return r.ok ? r : { ok: false, res: r.res };
}

export function parseQuery<S extends z.ZodTypeAny>(url: string | URL, schema: S): Parsed<z.infer<S>> {
  const sp = new URL(url).searchParams;
  const r = parseWith(schema, Object.fromEntries(sp.entries()));
  return r.ok ? r : { ok: false, res: r.res };
}
