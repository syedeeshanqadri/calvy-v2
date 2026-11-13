// The official Meta WhatsApp Cloud API (Graph API), one small client. Every call uses the business's OWN
// access token. Tokens are never logged: errors keep only Meta's code and message.

/** The one place the Graph API version is set. Check developers.facebook.com/docs/graph-api/changelog before bumping. */
export const GRAPH_VERSION = "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface GraphResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  /** Meta's error, when not ok. `code` 190 (and HTTP 401) mean the token is invalid or revoked. */
  error?: { code?: number; message: string };
}

/** Injectable for tests; defaults to global fetch. */
export type Fetcher = typeof fetch;

export async function graph<T = Record<string, unknown>>(
  token: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {},
  fetcher: Fetcher = fetch,
): Promise<GraphResult<T>> {
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  try {
    const res = await fetcher(`${GRAPH_BASE}/${path}${qs}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_user_msg?: string } } & Record<string, unknown>;
    if (!res.ok) {
      const e = json.error;
      return { ok: false, status: res.status, data: json as T, error: { code: e?.code, message: e?.error_user_msg ?? e?.message ?? `Meta returned ${res.status}` } };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch {
    return { ok: false, status: 0, data: {} as T, error: { message: "Could not reach Meta. Try again in a moment." } };
  }
}

/** True when Meta says the token is bad (expired, revoked, wrong app) rather than a passing fault. */
export const isTransient = (r: GraphResult): boolean => !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500);

export function isAuthFailure(r: GraphResult): boolean {
  return !r.ok && (r.status === 401 || r.error?.code === 190);
}

export interface Credentials { phoneNumberId: string; wabaId: string; accessToken: string }

export interface ConnectionInfo {
  displayPhone: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
}

export type VerifyOutcome =
  | { ok: true; info: ConnectionInfo }
  | { ok: false; reason: string; authFailure: boolean; /** Network failure or Meta 5xx / 429: says nothing about the credentials. */ transient: boolean };

/** Confirm the number (name, quality, messaging limit) and that the token can also reach the WABA. */
export async function verifyConnection(c: Credentials, fetcher: Fetcher = fetch): Promise<VerifyOutcome> {
  const phone = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string }>(
    c.accessToken, c.phoneNumberId, { query: { fields: "display_phone_number,verified_name,quality_rating,messaging_limit_tier" } }, fetcher,
  );
  if (!phone.ok) {
    return { ok: false, authFailure: isAuthFailure(phone), transient: isTransient(phone), reason: isAuthFailure(phone) ? "Meta rejected the access token (invalid or revoked). Create a new System User token and reconnect." : `Phone number ID: ${phone.error?.message}` };
  }
  const waba = await graph(c.accessToken, c.wabaId, { query: { fields: "id" } }, fetcher);
  if (!waba.ok) {
    return { ok: false, authFailure: isAuthFailure(waba), transient: isTransient(waba), reason: isAuthFailure(waba) ? "Meta rejected the access token (invalid or revoked)." : `WhatsApp Business Account ID: ${waba.error?.message}. The token needs the whatsapp_business_management permission.` };
  }
  return {
    ok: true,
    info: {
      displayPhone: phone.data.display_phone_number ?? null,
      verifiedName: phone.data.verified_name ?? null,
      qualityRating: phone.data.quality_rating ?? null,
      messagingTier: phone.data.messaging_limit_tier ?? null,
    },
  };
}

export interface RemoteTemplate { id: string; name: string; language: string; status: string; reason: string | null }

/** Templates on the WABA (all pages, capped), with approval status and the rejection reason when there is one. */
export async function listTemplates(c: Credentials, fetcher: Fetcher = fetch): Promise<{ ok: true; templates: RemoteTemplate[] } | { ok: false; reason: string }> {
  const out: RemoteTemplate[] = [];
  let path: string | null = `${c.wabaId}/message_templates`;
  let query: Record<string, string> | undefined = { fields: "id,name,language,status,rejected_reason", limit: "100" };
  for (let page = 0; page < 30 && path; page++) {
    const r: GraphResult<{ data?: { id: string; name: string; language: string; status: string; rejected_reason?: string }[]; paging?: { cursors?: { after?: string }; next?: string } }> = await graph(c.accessToken, path, { query }, fetcher);
    if (!r.ok) return { ok: false, reason: r.error?.message ?? "Could not read templates" };
    for (const t of r.data.data ?? []) {
      if (!t.name.startsWith("calvy_")) continue; // filtered here: Meta's name= filter is not a reliable prefix match
      out.push({ id: t.id, name: t.name, language: t.language, status: t.status, reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null });
    }
    const after = r.data.paging?.cursors?.after && (r.data.paging.next || (r.data.data ?? []).length >= 100) ? r.data.paging.cursors.after : undefined;
    if (!after) break;
    query = { ...query, after };
  }
  return { ok: true, templates: out };
}

export async function createTemplate(c: Credentials, body: Record<string, unknown>, fetcher: Fetcher = fetch): Promise<{ ok: true; id: string; status: string } | { ok: false; reason: string; duplicate: boolean; authFailure: boolean }> {
  const r = await graph<{ id?: string; status?: string }>(c.accessToken, `${c.wabaId}/message_templates`, { method: "POST", body }, fetcher);
  if (r.ok) return { ok: true, id: r.data.id ?? "", status: r.data.status ?? "PENDING" };
  // 2388024 / "already exists": this name and language is already on the WABA (we just sync its status).
  const msg = r.error?.message ?? "Meta refused the template";
  return { ok: false, reason: msg, duplicate: r.error?.code === 2388024 || /already exist/i.test(msg), authFailure: isAuthFailure(r) };
}

/** What the outbox adapter and the "send test" button call: one template message to one number (digits, no plus). */
export async function sendTemplateMessage(
  c: Credentials,
  to: string,
  tpl: { name: string; language: string; params: string[]; buttonSuffix?: string },
  fetcher: Fetcher = fetch,
): Promise<{ ok: true; messageId: string } | { ok: false; reason: string; status: number; authFailure: boolean }> {
  const components: unknown[] = [];
  if (tpl.params.length) components.push({ type: "body", parameters: tpl.params.map((text) => ({ type: "text", text })) });
  if (tpl.buttonSuffix) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: tpl.buttonSuffix }] });
  const r = await graph<{ messages?: { id: string }[] }>(
    c.accessToken, `${c.phoneNumberId}/messages`,
    { method: "POST", body: { messaging_product: "whatsapp", to, type: "template", template: { name: tpl.name, language: { code: tpl.language }, components } } },
    fetcher,
  );
  if (r.ok) return { ok: true, messageId: r.data.messages?.[0]?.id ?? "" };
  return { ok: false, reason: r.error?.message ?? "WhatsApp send failed", status: r.status, authFailure: isAuthFailure(r) };
}
