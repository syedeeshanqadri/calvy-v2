import { createHash } from "node:crypto";

export const ADMIN_COOKIE = "calvy_admin";
export const ADMIN_IDLE_MS = 30 * 60_000;
export const REAUTH_WINDOW_MS = 5 * 60_000;
export const VIEW_AS_MS = 30 * 60_000;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
