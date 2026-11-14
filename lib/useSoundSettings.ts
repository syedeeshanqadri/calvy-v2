"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { AlertAudio, DEFAULT_SOUND, readSoundSettings, soundKey, writeSoundSettings, type SoundSettings } from "@/lib/alertSound";

const CHANGED = "calvy:sound-settings";
let audio: AlertAudio | null = null;
/** One audio player for the whole app (the browser allows a single unlocked context per page). */
export const getAlertAudio = (): AlertAudio | null => { if (typeof window === "undefined") return null; return (audio ??= new AlertAudio()); };

const subscribe = (cb: () => void) => { window.addEventListener(CHANGED, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(CHANGED, cb); window.removeEventListener("storage", cb); }; };

/** This person's sound on/off and volume on this device (localStorage, so it survives restarts and is read synchronously). */
export function useSoundSettings(userId: string | undefined) {
  const raw = useSyncExternalStore(subscribe, () => (userId ? localStorage.getItem(soundKey(userId)) ?? "" : ""), () => "");
  const settings: SoundSettings = useMemo(() => (userId ? readSoundSettings(userId, { getItem: () => raw || null }) : DEFAULT_SOUND), [userId, raw]);
  const update = useCallback((next: Partial<SoundSettings>) => {
    if (!userId) return;
    writeSoundSettings(userId, { ...settings, ...next }, localStorage);
    window.dispatchEvent(new Event(CHANGED));
  }, [userId, settings]);
  return { settings, update };
}

/** "locked" until a tap has unlocked audio in this page: drives the "Tap to enable sound" chip. */
export function useAudioState(): "locked" | "unlocked" {
  return useSyncExternalStore(
    (cb) => getAlertAudio()?.subscribe(cb) ?? (() => {}),
    () => getAlertAudio()?.state ?? "locked",
    () => "locked",
  );
}
