import { logger } from "@/lib/logger";
const BASE_URL = "https://graph.facebook.com/v19.0";

function isConfigured() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || phoneId === "REPLACE_ME" || !token || token === "REPLACE_ME") {
    logger.info("whatsapp not configured; skipping");
    return false;
  }
  return true;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function sendMessage(to: string, body: string) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;

  const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }

  return res.json();
}

export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    await sendMessage(to, body);
    return true;
  } catch (err) {
    logger.error("[WhatsApp] Send failed:", { err });
    return false;
  }
}

export async function sendBookingConfirmationWhatsApp(details: {
  to: string;
  clientName: string;
  serviceName: string;
  businessName: string;
  date: string;
  time: string;
}) {
  if (!isConfigured()) return;
  const { to, clientName, serviceName, businessName, date, time } = details;
  const body = `Hi ${clientName}! ✅ Your *${serviceName}* at *${businessName}* is confirmed for *${date} at ${time}*. See you then! — Calvy`;

  try {
    const result = await sendMessage(to, body);
    logger.info("whatsapp confirmation sent");
  } catch (err) {
    logger.error("[WhatsApp] Failed to send confirmation:", { err });
  }
}

