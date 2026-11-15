// The live setup checklist on Phone alerts. Pure: the page gathers the facts, this decides what each line says.
export type Platform = "ios" | "android" | "mac" | "other";
export type ItemState = "ok" | "warn" | "fail" | "na";
export interface ChecklistItem { id: "permission" | "installed" | "subscribed" | "lastPush"; label: string; state: ItemState; detail: string }

export function detectPlatform(ua: string, platform = "", maxTouchPoints = 0): Platform {
  if (/iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  return "other";
}

/** First 6 + last 6 characters of a key (the same fingerprint the server stores and shows: never the key itself). */
export const fingerprint = (k: string) => { const n = k.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); return n.length > 12 ? `${n.slice(0, 6)}…${n.slice(-6)}` : "(short)"; };

export interface ChecklistFacts {
  platform: Platform;
  permission: "granted" | "denied" | "default" | "unsupported";
  standalone: boolean;
  /** This browser's subscription, and the key it was made with (null when the browser does not say). */
  subscription: { endpointKnown: boolean; keyFingerprint: string | null } | null;
  buildKeyFingerprint: string | null;
  /** What the server knows about this device (null = not fetched / no subscription). */
  server: { registered: boolean; deviceKeyFingerprint: string | null; serverKeyFingerprint: string | null; keyMatches: boolean; lastPushAt: string | null } | null;
  now: Date;
}

export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export function buildChecklist(f: ChecklistFacts): ChecklistItem[] {
  const permission: ChecklistItem =
    f.permission === "granted" ? { id: "permission", label: "Notification permission", state: "ok", detail: "Allowed on this device." }
    : f.permission === "denied" ? { id: "permission", label: "Notification permission", state: "fail", detail: "Blocked. Allow Calvy in your phone's notification settings, then come back." }
    : f.permission === "unsupported" ? { id: "permission", label: "Notification permission", state: "fail", detail: "This browser cannot show push notifications." }
    : { id: "permission", label: "Notification permission", state: "warn", detail: "Not asked yet. Tap Turn on for this device." };

  const installed: ChecklistItem = f.platform !== "ios"
    ? { id: "installed", label: "Installed to the Home Screen", state: "na", detail: "Not needed on this device." }
    : f.standalone ? { id: "installed", label: "Installed to the Home Screen", state: "ok", detail: "Opened from the Home Screen." }
    : { id: "installed", label: "Installed to the Home Screen", state: "fail", detail: "iPhone only delivers alerts to an installed app: Share → Add to Home Screen, then open Calvy from there." };

  let subscribed: ChecklistItem;
  if (!f.subscription) subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "fail", detail: "This device is not subscribed yet." };
  else if (f.server && !f.server.registered) subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "fail", detail: "The push service stopped accepting this device. Tap Re-enable alerts on this device." };
  else if (f.subscription.keyFingerprint && f.buildKeyFingerprint && f.subscription.keyFingerprint !== f.buildKeyFingerprint) subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "fail", detail: "Made with an older key. Tap Re-enable alerts on this device." };
  else if (f.server && f.server.deviceKeyFingerprint && f.server.serverKeyFingerprint && !f.server.keyMatches) subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "fail", detail: "The server uses a different key than this device. Tap Re-enable alerts on this device." };
  else if (f.server && !f.server.deviceKeyFingerprint) subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "warn", detail: "Registered before keys were recorded. Re-enable once to be sure." };
  else subscribed = { id: "subscribed", label: "Subscribed with the current key", state: "ok", detail: f.server?.deviceKeyFingerprint ? `Key ${f.server.deviceKeyFingerprint} matches the server.` : "Subscribed." };

  const lastPush: ChecklistItem = f.server?.lastPushAt
    ? { id: "lastPush", label: "Last successful push", state: "ok", detail: relativeTime(f.server.lastPushAt, f.now) }
    : { id: "lastPush", label: "Last successful push", state: "warn", detail: "Never. Tap Send test notification." };

  return [permission, installed, subscribed, lastPush];
}

/** Turning the SOUND on is a phone setting the web page cannot change: plain steps per platform. */
export function soundSteps(platform: Platform): { title: string; steps: string[] } {
  switch (platform) {
    case "ios": return { title: "iPhone", steps: ["Open Settings → Notifications → Calvy.", "Turn Sounds ON.", "Set Banner Style to Persistent, so an alert stays until you tap it.", "Check that no Focus mode is silencing Calvy."] };
    case "android": return { title: "Android", steps: ["Open Settings → Apps → Calvy Business (or Chrome) → Notifications.", "Open the notification category and turn Sound on.", "Turn on Pop on screen (heads-up) so it appears over other apps."] };
    case "mac": return { title: "Mac", steps: ["Open System Settings → Notifications → Google Chrome.", "Set the alert style to Alerts (not Banners), so it stays until you click it.", "Turn Play sound for notifications on."] };
    default: return { title: "This device", steps: ["Open your system notification settings for this browser or app.", "Allow sound and set the style to persistent alerts."] };
  }
}
