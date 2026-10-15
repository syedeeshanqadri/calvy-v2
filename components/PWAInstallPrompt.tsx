"use client";
import { useEffect, useState } from "react";
import { X, Download, Share2 } from "lucide-react";

type Platform = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed as standalone
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Previously dismissed
    if (localStorage.getItem("calvy-pwa-dismissed")) return;

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);

    if (isIOS && isSafari) {
      // Delay a bit so it doesn't feel instant
      const t = setTimeout(() => setPlatform("ios"), 3000);
      return () => clearTimeout(t);
    }

    if (isAndroid || (!isIOS && !isAndroid)) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setPlatform("android");
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  function dismiss() {
    localStorage.setItem("calvy-pwa-dismissed", "1");
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  }

  if (!platform || dismissed) return null;

  if (showIOSSteps) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[200] px-4 pt-4 safe-pb-4">
        <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-5 shadow-2xl max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-white text-sm">Add Calvy to Home Screen</p>
            <button onClick={dismiss} className="p-1 text-white/40 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0284c7] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              <span className="text-white/70">Tap the <Share2 size={13} className="inline text-[#0284c7] mx-0.5" /> <strong className="text-white">Share</strong> button at the bottom of Safari</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0284c7] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              <span className="text-white/70">Scroll down and tap <strong className="text-white">Add to Home Screen</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0284c7] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">3</span>
              <span className="text-white/70">Tap <strong className="text-white">Add</strong> to confirm</span>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] px-4 pt-4 safe-pb-4">
      <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-4 shadow-2xl max-w-sm mx-auto flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#0284c7] flex items-center justify-center flex-shrink-0 text-white text-lg font-bold">
          C
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight">Install Calvy</p>
          <p className="text-white/40 text-xs mt-0.5">Add to home screen for the best experience</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={dismiss} className="p-1.5 text-white/30 hover:text-white/60 transition-colors">
            <X size={15} />
          </button>
          {platform === "ios" ? (
            <button
              onClick={() => setShowIOSSteps(true)}
              className="flex items-center gap-1.5 bg-[#0284c7] px-3 py-2 rounded-xl text-white text-xs font-semibold"
            >
              <Share2 size={13} />
              How to
            </button>
          ) : (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 bg-[#0284c7] px-3 py-2 rounded-xl text-white text-xs font-semibold"
            >
              <Download size={13} />
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
