"use client";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void } }
}

/**
 * The invisible Cloudflare Turnstile check. Renders nothing visible (it only shows a challenge if Cloudflare insists). `getToken()` resolves with
 * the token (waiting a few seconds if it is still being issued) or null when there is no site key (development) or it could not be obtained,
 * in which case the server decides (it fails open only when it has no keys).
 */
export function useTurnstile(siteKey: string | null) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string | null) => void)[]>([]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !host || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(host, {
        sitekey: siteKey, appearance: "interaction-only",
        callback: (t: string) => { token.current = t; waiting.current.splice(0).forEach((f) => f(t)); },
        "expired-callback": () => { token.current = null; },
        "error-callback": () => { waiting.current.splice(0).forEach((f) => f(null)); },
      });
    };
    if (window.turnstile) mount();
    else if (!document.getElementById("cf-turnstile-api")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-api"; s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.defer = true; s.onload = mount;
      document.head.appendChild(s);
    } else document.getElementById("cf-turnstile-api")!.addEventListener("load", mount);
    return () => { cancelled = true; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; };
  }, [siteKey, host]);

  const getToken = useCallback((): Promise<string | null> => {
    if (!siteKey) return Promise.resolve(null);
    if (token.current) return Promise.resolve(token.current);
    return new Promise((resolve) => {
      waiting.current.push(resolve);
      window.setTimeout(() => resolve(token.current), 8000);
    });
  }, [siteKey]);

  /** After a failed submit the token is spent: get a fresh one. */
  const reset = useCallback(() => { token.current = null; if (widget.current && window.turnstile) window.turnstile.reset(widget.current); }, []);

  /** A callback ref: put it on an empty <div> where the (invisible) widget should live. */
  return { host: setHost, getToken, reset };
}
