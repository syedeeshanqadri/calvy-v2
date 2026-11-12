// The Calvy WhatsApp template set. Variables only (first name, business, date/time, service, token, link):
// no email or phone number ever appears in a message. All UTILITY, installed on each business's own WABA.

export const TEMPLATE_LANGUAGES = ["en", "hi"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export interface TemplateDef {
  /** Calvy event key; the template name is calvy_<key>_v1. */
  key: string;
  /** Body parameters in {{1}}.. order, with a sample value Meta needs for review. */
  params: { name: string; example: string }[];
  body: Record<TemplateLanguage, string>;
  /** A "view" button whose URL ends in {{1}}: the tracking code / path suffix. */
  button?: { text: Record<TemplateLanguage, string>; path: "tracking" | "dashboard"; example: string };
}

export const templateName = (key: string) => `calvy_${key}_v1`;

const FIRST = { name: "first name", example: "Priya" };
const BUSINESS = { name: "business", example: "Glow Studio" };
const WHEN = { name: "date and time", example: "Sat 15 Nov, 4:30 PM" };
const SERVICE = { name: "service", example: "Haircut" };

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "booking_confirmed",
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, your {{2}} at {{3}} is confirmed for {{4}}. You can view your booking below.",
      hi: "नमस्ते {{1}}, {{3}} में आपकी {{2}} {{4}} के लिए पक्की हो गई है। अपनी बुकिंग नीचे देखें।",
    },
    button: { text: { en: "View booking", hi: "बुकिंग देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "booking_reminder",
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, a reminder of your {{2}} at {{3}} on {{4}}. See you then!",
      hi: "नमस्ते {{1}}, {{3}} में {{4}} को आपकी {{2}} है, यह एक याद दिलाना है।",
    },
    button: { text: { en: "View booking", hi: "बुकिंग देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "booking_cancelled",
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, your {{2}} at {{3}} on {{4}} has been cancelled.",
      hi: "नमस्ते {{1}}, {{3}} में {{4}} को आपकी {{2}} रद्द कर दी गई है।",
    },
  },
  {
    key: "booking_rescheduled",
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, your {{2}} at {{3}} has been moved to {{4}}. You can view the new time below.",
      hi: "नमस्ते {{1}}, {{3}} में आपकी {{2}} अब {{4}} को है। नया समय नीचे देखें।",
    },
    button: { text: { en: "View booking", hi: "बुकिंग देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "token_issued",
    params: [FIRST, BUSINESS, { name: "token number", example: "14" }, { name: "estimated time", example: "4:30 PM" }],
    body: {
      en: "Hi {{1}}, your token at {{2}} is number {{3}}, estimated around {{4}}. Follow your turn live below.",
      hi: "नमस्ते {{1}}, {{2}} में आपका टोकन नंबर {{3}} है, अनुमानित समय {{4}}। अपनी बारी लाइव देखें।",
    },
    button: { text: { en: "Track my turn", hi: "मेरी बारी देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "token_next",
    params: [FIRST, BUSINESS, { name: "token number", example: "14" }],
    body: {
      en: "Hi {{1}}, your turn is coming up at {{2}}. Token {{3}} will be called shortly. Please be ready.",
      hi: "नमस्ते {{1}}, {{2}} में आपकी बारी आने वाली है। टोकन {{3}} जल्द बुलाया जाएगा। कृपया तैयार रहें।",
    },
    button: { text: { en: "Track my turn", hi: "मेरी बारी देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "payment_received",
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, we received your payment for {{2}} at {{3}} ({{4}}). Thank you!",
      hi: "नमस्ते {{1}}, {{3}} में {{2}} ({{4}}) के लिए आपका भुगतान मिल गया है। धन्यवाद!",
    },
  },
  {
    key: "staff_new_booking",
    params: [BUSINESS, SERVICE, FIRST, WHEN],
    body: {
      en: "New booking at {{1}}: {{2}} for {{3}} on {{4}}. Open Calvy to manage it.",
      hi: "{{1}} में नई बुकिंग: {{3}} के लिए {{2}}, {{4}} को। इसे प्रबंधित करने के लिए Calvy खोलें।",
    },
    button: { text: { en: "Open Calvy", hi: "Calvy खोलें" }, path: "dashboard", example: "appointments" },
  },
  {
    key: "connection_test",
    params: [FIRST, BUSINESS],
    body: {
      en: "Hi {{1}}, this is a test message from {{2}} sent through Calvy. Your WhatsApp connection works.",
      hi: "नमस्ते {{1}}, यह Calvy के ज़रिए {{2}} का एक टेस्ट संदेश है। आपका WhatsApp कनेक्शन काम कर रहा है।",
    },
  },
];

export interface UrlBases { tracking: string; dashboard: string }

/** The Graph API payload that creates one template in one language. */
export function buildTemplatePayload(def: TemplateDef, lang: TemplateLanguage, bases: UrlBases) {
  const components: Record<string, unknown>[] = [
    { type: "BODY", text: def.body[lang], example: { body_text: [def.params.map((p) => p.example)] } },
  ];
  if (def.button) {
    components.push({
      type: "BUTTONS",
      buttons: [{ type: "URL", text: def.button.text[lang], url: `${bases[def.button.path]}{{1}}`, example: [`${bases[def.button.path]}${def.button.example}`] }],
    });
  }
  return { name: templateName(def.key), language: lang, category: "UTILITY", components };
}

export const defFor = (key: string) => TEMPLATE_DEFS.find((d) => d.key === key) ?? null;
