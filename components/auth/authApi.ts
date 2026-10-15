export type AuthApiResult =
  | { ok: true }
  | { ok: false; kind: "rate-limit"; message: string }
  | { ok: false; kind: "error"; message: string }
  | { ok: false; kind: "network"; message: string };

export const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";

function minutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** POSTs JSON to an auth endpoint and normalises the 200 / 400 / 429 / network outcomes. */
export async function postAuth(path: string, body: Record<string, string>): Promise<AuthApiResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    if (res.status === 429) {
      const retry = Number(data?.retryAfter ?? res.headers.get("Retry-After"));
      const m = Number.isFinite(retry) && retry > 0 ? minutes(retry) : null;
      return {
        ok: false,
        kind: "rate-limit",
        message: m
          ? `Too many attempts. Try again in ${m} ${m === 1 ? "minute" : "minutes"}.`
          : "Too many attempts. Please try again in a few minutes.",
      };
    }
    return { ok: false, kind: "error", message: data?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, kind: "network", message: NETWORK_ERROR };
  }
}
