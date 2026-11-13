// The Calvy WhatsApp template set. Variables only (first name, business, date/time, service, token, link):
// no email or phone number ever appears in a message. All UTILITY, installed on each business's own WABA.

export const TEMPLATE_LANGUAGES = ["en", "hi"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export interface TemplateDef {
  /** Calvy event key; the template name is calvy_<key>_v<version>. */
  key: string;
  /** Bumped (to 2) only when a template had to change after it may already be on a WABA: Meta will not edit-by-name here. */
  version?: number;
  /** Body parameters in {{1}}.. order, with a sample value Meta needs for review. */
  params: { name: string; example: string }[];
  body: Record<TemplateLanguage, string>;
  /** A "view" button whose URL ends in {{1}}: the tracking code / path suffix. */
  button?: { text: Record<TemplateLanguage, string>; path: "tracking" | "dashboard"; example: string };
}

export const templateName = (key: string) => `calvy_${key}_v${TEMPLATE_DEFS.find((d) => d.key === key)?.version ?? 1}`;

const FIRST = { name: "first name", example: "Priya" };
const BUSINESS = { name: "business", example: "Glow Studio" };
const WHEN = { name: "date and time", example: "Sat 15 Nov, 4:30 PM" };
const SERVICE = { name: "service", example: "Haircut" };

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "booking_confirmed",
    version: 2, // v1 had a "View booking" button that only token bookings have a page for
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, your {{2}} at {{3}} is confirmed for {{4}}. See you then!",
      hi: "नमस्ते {{1}}, {{3}} में आपकी {{2}}, {{4}} के लिए पक्की हो गई है। मिलते हैं!",
    },
  },
  {
    key: "booking_reminder",
    version: 2,
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, a reminder of your {{2}} at {{3}} on {{4}}. See you then!",
      hi: "नमस्ते {{1}}, {{3}} में {{4}} को आपकी {{2}} है, यह एक याद दिलाना है।",
    },
  },
  {
    key: "booking_cancelled",
    version: 2,
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hello {{1}}, this is to confirm that your booking for {{2}} at {{3}} scheduled for {{4}} has been cancelled. No further action is needed from you.",
      hi: "नमस्ते {{1}}, यह पुष्टि है कि {{3}} में {{4}} के लिए आपकी {{2}} की बुकिंग रद्द कर दी गई है। आपकी ओर से किसी कार्रवाई की आवश्यकता नहीं है।",
    },
  },
  {
    key: "booking_rescheduled",
    version: 2,
    params: [FIRST, SERVICE, BUSINESS, WHEN],
    body: {
      en: "Hi {{1}}, your {{2}} at {{3}} has been moved to {{4}}. Please note the new time.",
      hi: "नमस्ते {{1}}, {{3}} में आपकी {{2}} अब {{4}} को है। कृपया नया समय नोट कर लें।",
    },
  },
  {
    key: "token_issued",
    version: 2,
    params: [FIRST, BUSINESS, { name: "token number", example: "14" }, { name: "estimated time", example: "4:30 PM" }],
    body: {
      en: "Hello {{1}}, this is a confirmation of your queue token for your visit to {{2}}. Token number: {{3}}. Estimated time: {{4}}. You can check the current status of your token using the button below.",
      hi: "नमस्ते {{1}}, यह {{2}} में आपकी विज़िट के लिए आपके कतार टोकन की पुष्टि है। टोकन नंबर: {{3}}। अनुमानित समय: {{4}}। अपने टोकन की वर्तमान स्थिति नीचे दिए बटन से देखें।",
    },
    button: { text: { en: "Check token status", hi: "टोकन की स्थिति देखें" }, path: "tracking", example: "abc123def456" },
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
      hi: "नई बुकिंग: {{1}} में {{3}} के लिए {{2}}, {{4}} को। इसे प्रबंधित करने के लिए Calvy खोलें।",
    },
    button: { text: { en: "Open Calvy", hi: "Calvy खोलें" }, path: "dashboard", example: "appointments" },
  },
  {
    key: "booking_meeting_link",
    params: [FIRST, SERVICE, BUSINESS, WHEN, { name: "joining link", example: "https://meet.example.com/abc-defg" }],
    body: {
      en: "Hi {{1}}, here is the joining link for your online {{2}} at {{3}} on {{4}}: {{5}} Please join a few minutes early.",
      hi: "नमस्ते {{1}}, {{3}} में {{4}} को आपकी ऑनलाइन {{2}} का जुड़ने का लिंक: {{5}} कृपया कुछ मिनट पहले जुड़ें।",
    },
  },
  {
    key: "visit_thanks",
    params: [FIRST, BUSINESS, SERVICE, WHEN],
    body: {
      en: "Hi {{1}}, thank you for visiting {{2}} for your {{3}} on {{4}}. We hope to see you again.",
      hi: "नमस्ते {{1}}, {{4}} को {{2}} में {{3}} के लिए आने का धन्यवाद। हम आपसे फिर मिलने की आशा करते हैं।",
    },
  },
  {
    key: "booking_no_show",
    params: [FIRST, BUSINESS, SERVICE, WHEN],
    body: {
      en: "Hi {{1}}, we missed you at {{2}} for your {{3}} on {{4}}. You can book again any time.",
      hi: "नमस्ते {{1}}, {{4}} को {{2}} में आपकी {{3}} के लिए हमें आपकी कमी खली। आप कभी भी दोबारा बुक कर सकते हैं।",
    },
  },
  {
    key: "token_moved_back",
    version: 2,
    params: [FIRST, BUSINESS, { name: "token number", example: "14" }, { name: "place in line", example: "5" }],
    body: {
      en: "Hello {{1}}, this is an update on your queue token for your visit to {{2}}. Token {{3}} was called and you were not present, so your token has been moved back. Your current position in the queue is {{4}}. You can check the status of your token using the button below.",
      hi: "नमस्ते {{1}}, यह {{2}} में आपकी विज़िट के लिए आपके कतार टोकन की जानकारी है। टोकन {{3}} बुलाया गया और आप मौजूद नहीं थे, इसलिए आपका टोकन पीछे कर दिया गया है। कतार में आपकी वर्तमान स्थिति {{4}} है। अपने टोकन की स्थिति नीचे दिए बटन से देखें।",
    },
    button: { text: { en: "Check token status", hi: "टोकन की स्थिति देखें" }, path: "tracking", example: "abc123def456" },
  },
  {
    key: "token_closed",
    params: [FIRST, BUSINESS, { name: "token number", example: "14" }],
    body: {
      en: "Hi {{1}}, your token {{3}} at {{2}} has been closed because it was missed or cancelled. You can book a new one any time.",
      hi: "नमस्ते {{1}}, {{2}} में आपका टोकन {{3}} छूट जाने या रद्द होने के कारण बंद कर दिया गया है। आप कभी भी नया बुक कर सकते हैं।",
    },
  },
  {
    key: "review_request",
    params: [FIRST, BUSINESS, { name: "review link", example: "https://g.page/r/example/review" }],
    body: {
      en: "Hi {{1}}, thank you for visiting {{2}}. We would love your feedback, you can leave a review here: {{3}} It only takes a minute.",
      hi: "नमस्ते {{1}}, {{2}} में आने का धन्यवाद। हमें आपकी राय जानकर खुशी होगी, आप यहाँ रिव्यू दे सकते हैं: {{3}} इसमें बस एक मिनट लगता है।",
    },
  },
  {
    key: "visit_thanks_follow_up",
    params: [FIRST, BUSINESS, SERVICE, WHEN, { name: "last day", example: "30 Nov" }],
    body: {
      en: "Hi {{1}}, thank you for visiting {{2}} for your {{3}} on {{4}}. You can book one free follow-up until {{5}} from your bookings page.",
      hi: "नमस्ते {{1}}, {{4}} को {{2}} में {{3}} के लिए आने का धन्यवाद। आप {{5}} तक अपनी बुकिंग पेज से एक मुफ़्त फॉलो-अप बुक कर सकते हैं।",
    },
  },
  {
    key: "staff_alert",
    params: [BUSINESS, { name: "alert", example: "New booking: Priya K., Haircut, Sat 15 Nov 4:30 PM." }],
    body: {
      en: "Calvy alert for {{1}}: {{2}} Open Calvy for the details.",
      hi: "Calvy अलर्ट, {{1}}: {{2}} विवरण के लिए Calvy खोलें।",
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

/** Names of the templates Calvy currently uses (older versions may still exist on Meta; the app ignores them). */
export const currentTemplateNames = (): Set<string> => new Set(TEMPLATE_DEFS.map((d) => templateName(d.key)));

export const defFor = (key: string) => TEMPLATE_DEFS.find((d) => d.key === key) ?? null;
