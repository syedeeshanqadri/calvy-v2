// The "new booking" sound for the open app: settings per person (per device), a vibration pattern, and an audio player that survives the
// browsers' autoplay rules (audio can only start after a tap, so the first tap anywhere unlocks it).
export const SOUND_URL = "/sounds/new-booking.wav";
export const VIBRATE_PATTERN = [300, 100, 300, 100, 300];

export interface SoundSettings { on: boolean; volume: number }
export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 1 };
export const clampVolume = (v: unknown): number => { const n = typeof v === "number" && Number.isFinite(v) ? v : 1; return Math.min(1, Math.max(0.1, n)); };
export const soundKey = (userId: string) => `calvy-alert-sound:${userId}`;

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Stored per person on this device: a reception phone can be loud while the owner's own phone stays quiet. Bad data = the defaults. */
export function readSoundSettings(userId: string, storage: Pick<Store, "getItem"> | null): SoundSettings {
  try {
    const raw = storage?.getItem(soundKey(userId));
    if (!raw) return DEFAULT_SOUND;
    const j = JSON.parse(raw) as Partial<SoundSettings>;
    return { on: j.on !== false, volume: clampVolume(j.volume) };
  } catch { return DEFAULT_SOUND; }
}
export function writeSoundSettings(userId: string, s: SoundSettings, storage: Store | null): SoundSettings {
  const clean = { on: !!s.on, volume: clampVolume(s.volume) };
  try { storage?.setItem(soundKey(userId), JSON.stringify(clean)); } catch { /* private mode: lives until reload */ }
  return clean;
}

/** Android vibrates (Chrome needs the page to have been tapped once). iPhone has no vibration API: nothing happens there. */
export function vibrateNow(nav: { vibrate?: (p: number | number[]) => boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  try { return !!nav?.vibrate?.(VIBRATE_PATTERN); } catch { return false; }
}

/** Alerts can arrive twice (the push message and the bell poll): the same booking within 60 seconds is one alert. */
export class AlertDeduper {
  private seen = new Map<string, number>();
  constructor(private readonly windowMs = 60_000) {}
  accept(key: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) if (now - t > this.windowMs) this.seen.delete(k);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now);
    return true;
  }
}

type Ctx = AudioContext;
type CtxFactory = () => Ctx;

/**
 * Plays the chime through Web Audio. `unlock()` must run inside a tap/keypress: it creates and resumes the audio context and plays a
 * silent buffer, after which `play()` works for the rest of the session, including when a push arrives and nobody is touching the phone.
 */
export class AlertAudio {
  private ctx: Ctx | null = null;
  private buffer: AudioBuffer | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly makeCtx: CtxFactory = () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(), private readonly load: () => Promise<ArrayBuffer> = () => fetch(SOUND_URL).then((r) => r.arrayBuffer())) {}

  get state(): "locked" | "unlocked" { return this.ctx?.state === "running" ? "unlocked" : "locked"; }
  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  private emit() { this.listeners.forEach((l) => l()); }

  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        this.ctx = this.makeCtx();
        this.ctx.addEventListener?.("statechange", () => this.emit());
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      const silent = this.ctx.createBuffer(1, 1, 22050); // iOS wants a sound started from the tap itself
      const src = this.ctx.createBufferSource(); src.buffer = silent; src.connect(this.ctx.destination); src.start(0);
      void this.ensureBuffer();
      this.emit();
      return this.state === "unlocked";
    } catch { return false; }
  }

  private async ensureBuffer() {
    if (this.buffer || !this.ctx) return;
    try { this.buffer = await this.ctx.decodeAudioData(await this.load()); } catch { /* retried on the next play */ }
  }

  /** Returns false when the browser still blocks audio (the "Tap to enable sound" chip stays visible). */
  async play(volume: number): Promise<boolean> {
    if (!this.ctx || this.state !== "unlocked") return false;
    await this.ensureBuffer();
    if (!this.buffer) return false;
    const gain = this.ctx.createGain();
    gain.gain.value = clampVolume(volume);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer; src.connect(gain); gain.connect(this.ctx.destination); src.start(0);
    return true;
  }
}
