import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

vi.mock("@/lib/prisma", () => ({ prisma: { notificationOutbox: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }, business: { findMany: vi.fn() }, pushDevice: { findMany: vi.fn() } } }));
vi.mock("@/lib/notifications/process", () => ({ attemptNow: vi.fn() }));
import {
  AlertAudio, AlertDeduper, DEFAULT_SOUND, VIBRATE_PATTERN, clampVolume, readSoundSettings, soundKey, vibrateNow, writeSoundSettings,
} from "@/lib/alertSound";
import { alertKey, shouldChime } from "@/lib/alertEvents";
import { buildChecklist, detectPlatform, fingerprint, relativeTime, soundSteps, type ChecklistFacts } from "@/lib/pushChecklist";
import { logTimeLabel } from "@/lib/notifications/log";

// ── sound settings ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("sound settings (per person, per device)", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
  it("defaults to ON at full volume when nothing is stored", () => {
    expect(readSoundSettings("u1", mem())).toEqual(DEFAULT_SOUND);
    expect(readSoundSettings("u1", null)).toEqual(DEFAULT_SOUND);
  });
  it("stores each person separately and clamps the volume to 10%..100%", () => {
    const s = mem();
    writeSoundSettings("owner", { on: false, volume: 0.4 }, s);
    writeSoundSettings("reception", { on: true, volume: 7 }, s);
    expect(readSoundSettings("owner", s)).toEqual({ on: false, volume: 0.4 });
    expect(readSoundSettings("reception", s)).toEqual({ on: true, volume: 1 });
    expect(s.m.has(soundKey("owner"))).toBe(true);
    expect(clampVolume(0)).toBe(0.1);
    expect(clampVolume(NaN)).toBe(1);
    expect(clampVolume("loud")).toBe(1);
  });
  it("corrupt storage falls back to the defaults instead of throwing", () => {
    expect(readSoundSettings("u1", { getItem: () => "{not json" })).toEqual(DEFAULT_SOUND);
    expect(readSoundSettings("u1", { getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_SOUND);
  });
  it("a private-mode write failure is swallowed", () => {
    expect(() => writeSoundSettings("u1", DEFAULT_SOUND, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });
});

describe("vibration", () => {
  it("uses the loud pattern; no vibration API (iPhone) or a thrown error is a quiet false", () => {
    const vibrate = vi.fn(() => true);
    expect(vibrateNow({ vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(VIBRATE_PATTERN);
    expect(VIBRATE_PATTERN).toEqual([300, 100, 300, 100, 300]);
    expect(vibrateNow({})).toBe(false);
    expect(vibrateNow({ vibrate: () => { throw new Error("no activation"); } })).toBe(false);
  });
});

describe("one alert per booking, whichever route reported it", () => {
  it("dedupes the same booking for 60 seconds, not different bookings, and forgets afterwards", () => {
    const d = new AlertDeduper();
    expect(d.accept("/dashboard/appointments?open=a1", 1000)).toBe(true);
    expect(d.accept("/dashboard/appointments?open=a1", 30_000)).toBe(false); // the push AND the bell poll
    expect(d.accept("/dashboard/appointments?open=a2", 30_000)).toBe(true);
    expect(d.accept("/dashboard/appointments?open=a1", 62_000)).toBe(true);
  });
  it("keys on the booking link when there is one, else on the text; only real events chime", () => {
    expect(alertKey({ title: "x", body: "y", url: "/dashboard/appointments?open=a1" })).toBe("/dashboard/appointments?open=a1");
    expect(alertKey({ title: "Token moved", body: "5", url: "/dashboard/queue" })).toBe("Token moved|5");
    expect(["booking_new", "queue", "payment", "booking_cancelled", "booking_rescheduled", undefined].every(shouldChime)).toBe(true);
    expect(shouldChime("summary")).toBe(false);
    expect(shouldChime("reminder")).toBe(false);
  });
});

// ── audio unlock (autoplay rules) ─────────────────────────────────────────────────────────────────────────────────────────
describe("AlertAudio: locked until a tap, then plays at the chosen volume", () => {
  function fakeContext(startsRunning = false) {
    const log = { resumed: 0, started: 0, gains: [] as number[], silent: 0 };
    const listeners: (() => void)[] = [];
    const ctx: any = {
      state: startsRunning ? "running" : "suspended",
      destination: {},
      addEventListener: (_t: string, fn: () => void) => { listeners.push(fn); },
      resume: async () => { log.resumed++; ctx.state = "running"; listeners.forEach((l) => l()); },
      createBuffer: () => { log.silent++; return {}; },
      createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => { log.started++; } }),
      createGain: () => ({ gain: { set value(v: number) { log.gains.push(v); } }, connect: () => {} }),
      decodeAudioData: async () => ({ duration: 1.05 }),
    };
    return { ctx, log };
  }
  it("cannot play before a tap: play() is false and the state is locked (the 'Tap to enable sound' chip shows)", async () => {
    const { ctx } = fakeContext();
    const a = new AlertAudio(() => ctx, async () => new ArrayBuffer(8));
    expect(a.state).toBe("locked");
    expect(await a.play(1)).toBe(false);
  });
  it("unlock (inside a tap) resumes the context and plays a silent buffer; then it plays at the clamped volume", async () => {
    const { ctx, log } = fakeContext();
    const a = new AlertAudio(() => ctx, async () => new ArrayBuffer(8));
    const changed = vi.fn();
    a.subscribe(changed);
    expect(await a.unlock()).toBe(true);
    expect(a.state).toBe("unlocked");
    expect(log.resumed).toBe(1);
    expect(log.silent).toBe(1);
    expect(changed).toHaveBeenCalled(); // the chip hides
    expect(await a.play(0.5)).toBe(true);
    expect(await a.play(5)).toBe(true);
    expect(log.gains).toEqual([0.5, 1]);
  });
  it("a browser that refuses to start audio stays locked, and nothing throws", async () => {
    const ctx: any = { state: "suspended", destination: {}, resume: async () => { throw new Error("NotAllowedError"); }, createBuffer: () => ({}), createBufferSource: () => ({}), addEventListener: () => {} };
    const a = new AlertAudio(() => ctx, async () => new ArrayBuffer(8));
    expect(await a.unlock()).toBe(false);
    expect(a.state).toBe("locked");
  });
});

// ── the setup checklist ───────────────────────────────────────────────────────────────────────────────────────────────────
describe("Phone alerts checklist", () => {
  const NOW = new Date("2026-11-14T15:00:00Z");
  const good = (over: Partial<ChecklistFacts> = {}): ChecklistFacts => ({
    platform: "ios", permission: "granted", standalone: true,
    subscription: { endpointKnown: true, keyFingerprint: "BGiX-4…45kY9s" }, buildKeyFingerprint: "BGiX-4…45kY9s",
    server: { registered: true, deviceKeyFingerprint: "BGiX-4…45kY9s", serverKeyFingerprint: "BGiX-4…45kY9s", keyMatches: true, lastPushAt: "2026-11-14T14:55:00Z" }, now: NOW, ...over,
  });
  const states = (f: ChecklistFacts) => Object.fromEntries(buildChecklist(f).map((i) => [i.id, i.state]));

  it("everything in place: all four lines are ok and the last push says how long ago", () => {
    expect(states(good())).toEqual({ permission: "ok", installed: "ok", subscribed: "ok", lastPush: "ok" });
    expect(buildChecklist(good()).find((i) => i.id === "lastPush")!.detail).toBe("5 min ago");
  });
  it("permission: denied is a failure with the way out, not yet asked is a warning", () => {
    expect(states(good({ permission: "denied" })).permission).toBe("fail");
    expect(states(good({ permission: "default" })).permission).toBe("warn");
    expect(states(good({ permission: "unsupported" })).permission).toBe("fail");
  });
  it("iPhone must be installed to the Home Screen; other platforms do not need it", () => {
    expect(states(good({ standalone: false })).installed).toBe("fail");
    expect(buildChecklist(good({ standalone: false })).find((i) => i.id === "installed")!.detail).toContain("Add to Home Screen");
    expect(states(good({ platform: "android", standalone: false })).installed).toBe("na");
    expect(states(good({ platform: "mac", standalone: false })).installed).toBe("na");
  });
  it("subscribed with the CURRENT key: not subscribed, dropped by the server, old key and a server key mismatch all fail", () => {
    expect(states(good({ subscription: null, server: null })).subscribed).toBe("fail");
    expect(states(good({ server: { registered: false, deviceKeyFingerprint: null, serverKeyFingerprint: "x", keyMatches: false, lastPushAt: null } })).subscribed).toBe("fail");
    expect(states(good({ subscription: { endpointKnown: true, keyFingerprint: "OLD123…OLD456" } })).subscribed).toBe("fail");
    expect(states(good({ server: { registered: true, deviceKeyFingerprint: "BGiX-4…45kY9s", serverKeyFingerprint: "ZZZZZZ…YYYYYY", keyMatches: false, lastPushAt: null } })).subscribed).toBe("fail");
  });
  it("a device registered before keys were recorded is a warning (re-enable once); never pushed is a warning", () => {
    expect(states(good({ server: { registered: true, deviceKeyFingerprint: null, serverKeyFingerprint: "x", keyMatches: false, lastPushAt: null } })).subscribed).toBe("warn");
    expect(states(good({ server: { registered: true, deviceKeyFingerprint: "BGiX-4…45kY9s", serverKeyFingerprint: "BGiX-4…45kY9s", keyMatches: true, lastPushAt: null } })).lastPush).toBe("warn");
  });
  it("never prints a key: only 6+6 character fingerprints", () => {
    const text = JSON.stringify(buildChecklist(good()));
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}/);
    expect(fingerprint("B".repeat(30) + "xyz123")).toBe("BBBBBB…xyz123");
  });
  it("relative times", () => {
    expect(relativeTime(null, NOW)).toBe("never");
    expect(relativeTime("2026-11-14T14:59:40Z", NOW)).toBe("just now");
    expect(relativeTime("2026-11-14T12:00:00Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-11-12T15:00:00Z", NOW)).toBe("2 d ago");
  });
  it("platform detection and the plain steps for turning sound on", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe("ios"); // iPad that says Mac
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 7)")).toBe("android");
    expect(soundSteps("ios").steps.join(" ")).toMatch(/Notifications → Calvy[\s\S]*Sounds ON[\s\S]*Persistent/);
    expect(soundSteps("android").steps.join(" ")).toMatch(/Calvy Business[\s\S]*Sound[\s\S]*Pop on screen/);
    expect(soundSteps("mac").steps.join(" ")).toMatch(/Notifications → Google Chrome[\s\S]*Alerts/);
  });
});

// ── delivery log times ────────────────────────────────────────────────────────────────────────────────────────────────────
describe("delivery log times are in the business timezone (not the server's UTC)", () => {
  it("India: 14:44 UTC reads 8:14 pm IST; London in winter stays UTC", () => {
    const t = new Date("2026-11-14T14:44:00Z");
    expect(logTimeLabel(t, "Asia/Kolkata")).toMatch(/14 Nov.*8:14\s?pm.*IST/i);
    expect(logTimeLabel(t, "Europe/London")).toMatch(/14 Nov.*14:44/);
    expect(logTimeLabel(t, "Not/AZone")).toMatch(/14 Nov.*14:44.*UTC/); // bad zone: UTC, labelled as UTC
  });
  it("the table shows the label from the server, not a browser-formatted date", () => {
    const src = readFileSync("components/notifications/LogTable.tsx", "utf8");
    expect(src).toContain("r.whenLabel");
    expect(src).not.toContain("toLocaleString");
    expect(readFileSync("lib/notifications/log.ts", "utf8")).toContain("whenLabel: logTimeLabel(");
  });
});

// ── the bundled chime ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundled chime (public/sounds/new-booking.wav)", () => {
  const wav = readFileSync("public/sounds/new-booking.wav");
  it("is a short mono 16-bit PCM WAV of about one second", () => {
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt16LE(34)).toBe(16);
    const seconds = wav.readUInt32LE(40) / (wav.readUInt32LE(24) * 2);
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(1.3);
    expect(wav.length).toBeLessThan(200 * 1024);
  });
  it("is normalised loud (peak near full scale) and ends faded out (no click)", () => {
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    expect(peak / 32768).toBeGreaterThan(0.95);
    expect(peak / 32768).toBeLessThanOrEqual(1);
    expect(Math.abs(wav.readInt16LE(wav.length - 2))).toBeLessThan(400);
  });
});

// ── wiring ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("wiring", () => {
  it("the alert centre is mounted on every dashboard page and listens for pushes and the bell", () => {
    expect(readFileSync("components/dashboard/DashboardLayout.tsx", "utf8")).toContain("<AlertCenter />");
    const ac = readFileSync("components/dashboard/AlertCenter.tsx", "utf8");
    expect(ac).toContain("Tap to enable sound");
    expect(ac).toContain('type === "calvy-alert"');
    expect(ac).toContain("vibrateNow()");
    expect(ac).toContain("alert-toast");
    const header = readFileSync("components/dashboard/Header.tsx", "utf8");
    expect(header).toContain("emitAlert(");
    expect(header).toContain("seenIds"); // the first load only records, so opening the app does not chime for old alerts
  });
  it("Phone alerts has the checklist, the sound settings with a test button, and the real-push test result", () => {
    const alerts = readFileSync("app/dashboard/alerts/AlertsClient.tsx", "utf8");
    expect(alerts).toContain("<PushChecklist");
    expect(alerts).toContain("<SoundSettings");
    expect(alerts).toContain("Delivered to the push service");
    expect(readFileSync("components/dashboard/SoundSettings.tsx", "utf8")).toContain("Play test sound");
  });
  it("the Android channel note is in the TWA doc", () => {
    const doc = readFileSync("docs/twa-playstore.md", "utf8");
    expect(doc).toContain("notification channel");
    expect(doc).toContain("new_booking.wav");
  });
});
