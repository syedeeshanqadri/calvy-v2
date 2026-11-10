"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "calvy-install-dismissed";

/** "Install app": the native prompt on Android/Chrome, a short Share → Add to Home Screen guide on iPhone. Dismissible and remembered. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try { if (localStorage.getItem(KEY)) return; } catch { /* private mode: just show it */ }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already installed
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const small = window.matchMedia("(max-width: 1023px)").matches;
    if (isIos && small) { setIos(true); setHidden(false); }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setHidden(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setHidden(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (hidden || (!evt && !ios)) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };

  return (
    <div className="mx-4 sm:mx-6 mt-3 flex items-start gap-3 bg-white border border-[#e8e6e0] rounded-xl px-4 py-3" data-testid="install-prompt">
      <Download size={16} className="text-sky-600 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 text-xs text-[#3d3d4d]">
        <p className="font-semibold text-[#0f0f1a]">Install Calvy Business on your phone</p>
        {evt ? (
          <p className="mt-0.5">Opens full screen like an app, with alerts for new bookings.</p>
        ) : (
          <p className="mt-0.5">In Safari tap <Share size={12} className="inline -mt-0.5" aria-hidden /> <b>Share</b>, then <b>Add to Home Screen</b>.</p>
        )}
      </div>
      {evt && (
        <button type="button" className="shrink-0 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1.5 rounded-lg"
          onClick={async () => { await evt.prompt(); const c = await evt.userChoice.catch(() => null); if (c?.outcome === "accepted") setHidden(true); setEvt(null); }}>
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-[#6b6b80] hover:text-[#0f0f1a]"><X size={14} /></button>
    </div>
  );
}
