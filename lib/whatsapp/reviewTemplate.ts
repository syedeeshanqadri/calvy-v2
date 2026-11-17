// Meta App Review demo: one UTILITY template, created on a connected WABA through the Graph API, with Meta's own answer
// (template id + status) handed back to the super admin. Not part of the Calvy template set: it is never installed for
// businesses, never sent, and the Settings page ignores it.
import { prisma } from "@/lib/prisma";
import { createTemplate, listTemplates, type Fetcher } from "@/lib/whatsapp/graph";
import { CredentialsUnreadable, credentialsOf } from "@/lib/whatsapp/store";

export const REVIEW_TEMPLATE_NAME = "calvy_app_review_demo";

export const reviewTemplatePayload = () => ({
  name: REVIEW_TEMPLATE_NAME,
  language: "en",
  category: "UTILITY",
  components: [{
    type: "BODY",
    text: "Hi {{1}}, your {{2}} at {{3}} is confirmed for {{4}}. See you then!",
    example: { body_text: [["Priya", "Haircut", "Glow Studio", "Sat 15 Nov, 4:30 PM"]] },
  }],
});

export type ReviewResult =
  | { ok: true; id: string; status: string; name: string; alreadyExisted: boolean }
  | { ok: false; error: string };

export async function createReviewTemplate(businessId: string, fetcher?: Fetcher): Promise<ReviewResult> {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c) return { ok: false, error: "That business has no WhatsApp connection." };
  if (c.status !== "CONNECTED") return { ok: false, error: "That WhatsApp connection is not CONNECTED. Reconnect it first." };
  let creds;
  try { creds = credentialsOf(c); } catch (e) { if (e instanceof CredentialsUnreadable) return { ok: false, error: e.message }; throw e; }
  const r = await createTemplate(creds, reviewTemplatePayload(), fetcher);
  if (r.ok) return { ok: true, id: r.id, status: r.status, name: REVIEW_TEMPLATE_NAME, alreadyExisted: false };
  if (r.duplicate) {
    // Created before: show what Meta has on file for it (id and current status) instead of an error.
    const list = await listTemplates(creds, fetcher);
    const have = list.ok ? list.templates.find((t) => t.name === REVIEW_TEMPLATE_NAME && t.language === "en") : null;
    if (have) return { ok: true, id: have.id, status: have.status, name: REVIEW_TEMPLATE_NAME, alreadyExisted: true };
  }
  return { ok: false, error: r.reason };
}
