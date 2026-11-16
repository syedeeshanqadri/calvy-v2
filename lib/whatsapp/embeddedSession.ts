// The browser side of Embedded Signup: reads the WA_EMBEDDED_SIGNUP message Meta posts to the page during FB.login.
// Pure (no DOM), so it is unit-tested. Only messages from Facebook's own origins are believed.

export type SessionMessage =
  | { kind: "finish"; wabaId: string; phoneNumberId: string | null; coexistence: boolean }
  | { kind: "cancel"; step: string | null }
  | { kind: "error"; message: string };

const ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);
const digits = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d{5,25}$/.test(String(v)) ? String(v) : null;

export function parseSessionMessage(origin: string, raw: unknown): SessionMessage | null {
  if (!ORIGINS.has(origin)) return null;
  let msg: unknown = raw;
  if (typeof raw === "string") { try { msg = JSON.parse(raw); } catch { return null; } }
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { type?: string; event?: string; data?: Record<string, unknown> };
  if (m.type !== "WA_EMBEDDED_SIGNUP") return null;
  const data = m.data ?? {};
  if (m.event === "CANCEL") {
    const err = typeof data.error_message === "string" ? data.error_message : null;
    return err ? { kind: "error", message: err } : { kind: "cancel", step: typeof data.current_step === "string" ? data.current_step : null };
  }
  const coexistence = m.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
  if (m.event === "FINISH" || m.event === "FINISH_ONLY_WABA" || coexistence) {
    const wabaId = digits(data.waba_id);
    if (!wabaId) return { kind: "error", message: "Meta did not return a WhatsApp Business Account." };
    return { kind: "finish", wabaId, phoneNumberId: digits(data.phone_number_id), coexistence };
  }
  return null;
}

/** The FB.login options. Coexistence = a number already used in the WhatsApp Business app (Meta: featureType whatsapp_business_app_onboarding, session info v3). */
export function loginOptions(configId: string, coexistence: boolean) {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {}, sessionInfoVersion: "3", ...(coexistence ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
  };
}
