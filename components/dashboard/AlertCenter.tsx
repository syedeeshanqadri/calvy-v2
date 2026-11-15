"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BellRing, Volume2, X } from "lucide-react";
import { ALERT_EVENT, alertKey, shouldChime, type AlertDetail } from "@/lib/alertEvents";
import { AlertDeduper, vibrateNow } from "@/lib/alertSound";
import { getAlertAudio, useAudioState, useSoundSettings } from "@/lib/useSoundSettings";

interface Toast extends AlertDetail { id: number }
const TOAST_MS = 14_000;

/**
 * Makes a new booking impossible to miss while the app is open: a clear chime, vibration on Android, and a card with the booking.
 * Browsers only allow sound after a tap, so the first tap anywhere unlocks audio; until then a "Tap to enable sound" chip shows.
 */
export function AlertCenter() {
  const userId = useSession().data?.user?.id;
  const { settings } = useSoundSettings(userId);
  const audioState = useAudioState();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dedupe = useRef(new AlertDeduper());
  const nextId = useRef(1);
  const latest = useRef(settings);
  useEffect(() => { latest.current = settings; });

  // The first tap or key press after the page opens unlocks audio for the rest of the session.
  useEffect(() => {
    const unlock = () => { void getAlertAudio()?.unlock(); };
    const events = ["pointerdown", "touchend", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { once: false, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  const raise = useCallback((d: AlertDetail) => {
    if (!dedupe.current.accept(alertKey(d))) return;
    const id = nextId.current++;
    setToasts((t) => [{ ...d, id }, ...t].slice(0, 3));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
    if (shouldChime(d.kind) && latest.current.on) {
      void getAlertAudio()?.play(latest.current.volume);
      vibrateNow();
    }
  }, []);

  useEffect(() => {
    const onAlert = (e: Event) => raise((e as CustomEvent<AlertDetail>).detail);
    window.addEventListener(ALERT_EVENT, onAlert);
    // A push arrived while the app is in front: the service worker forwards it so it gets the same treatment.
    const onSw = (e: MessageEvent) => { if (e.data?.type === "calvy-alert") raise(e.data.alert as AlertDetail); };
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => { window.removeEventListener(ALERT_EVENT, onAlert); navigator.serviceWorker?.removeEventListener("message", onSw); };
  }, [raise]);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <>
      {settings.on && audioState === "locked" && (
        <button
          type="button"
          onClick={() => { void getAlertAudio()?.unlock().then((ok) => ok && getAlertAudio()?.play(latest.current.volume)); }}
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[75] inline-flex items-center gap-2 min-h-11 rounded-full bg-[#0f0f1a] text-white text-sm font-semibold px-4 shadow-xl"
          data-testid="enable-sound-chip"
        >
          <Volume2 size={16} aria-hidden /> Tap to enable sound
        </button>
      )}
      <div className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[90] flex flex-col items-center gap-2 pointer-events-none" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} role="alert" className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0f0f1a] text-white shadow-2xl border border-white/10 pl-4 pr-1 py-2 flex items-center gap-3" data-testid="alert-toast">
            <BellRing size={20} className="shrink-0 text-sky-300" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{t.title}</p>
              <p className="text-xs text-white/80 truncate">{t.body}</p>
            </div>
            <Link href={t.url} onClick={() => dismiss(t.id)} className="shrink-0 min-h-11 inline-flex items-center px-3 rounded-lg text-sm font-semibold text-sky-300 hover:text-sky-200">Open</Link>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 w-11 h-11 inline-flex items-center justify-center text-white/60 hover:text-white"><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
