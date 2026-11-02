import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/** AES-256-GCM for the one secret value a queued message may carry (a reset or verify link). */
function key(): Buffer {
  const raw = process.env.NOTIFY_SECRET_KEY;
  if (!raw) throw new Error("NOTIFY_SECRET_KEY is not set");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, body] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
