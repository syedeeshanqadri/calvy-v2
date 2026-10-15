import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";

/** Parse a JSON request body. Malformed JSON yields a 400 response. */
export async function readJsonBody(req: Request): Promise<{ ok: true; data: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, data: await req.json() };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }) };
  }
}

export function parseWith<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; res: NextResponse; paths: string[] } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const details = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return {
    ok: false,
    paths: details.map((d) => d.path),
    res: NextResponse.json({ error: "Invalid input.", details }, { status: 400 }),
  };
}

export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later.", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Test-only hook: when AUTH_TEST_RETURN_TOKEN=1 and NODE_ENV is not
 * "production", the auth routes add the raw token to their JSON response so
 * end-to-end checks can run without a mailbox. Never active in production.
 */
export function testTokenHookEnabled(): boolean {
  return process.env.AUTH_TEST_RETURN_TOKEN === "1" && process.env.NODE_ENV !== "production";
}

export function appBaseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  return new URL(req.url).origin;
}
