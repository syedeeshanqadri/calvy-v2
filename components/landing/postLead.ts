export interface LeadPayload {
  email: string;
  name?: string;
  phone?: string;
  businessType?: string;
  demoRequested?: boolean;
  message?: string;
  source: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function postLead(payload: LeadPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong. Please try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}
