"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loginOptions, parseSessionMessage, type SessionMessage } from "@/lib/whatsapp/embeddedSession";

interface FB { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>) => void }
declare global { interface Window { FB?: FB; fbAsyncInit?: () => void } }

const GRAPH_VERSION = "v26.0";

function loadSdk(appId: string): Promise<FB> {
  return new Promise((resolve, reject) => {
    const ready = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION }); resolve(window.FB!); };
    if (window.FB) return ready();
    window.fbAsyncInit = ready;
    if (document.getElementById("facebook-jssdk")) return;
    const s = document.createElement("script");
    s.id = "facebook-jssdk"; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.onerror = () => reject(new Error("Could not load Facebook's sign-in. Check your connection or ad blocker and try again."));
    document.head.appendChild(s);
  });
}

export interface ConnectOutcome { ok: boolean; needPin?: boolean; wrongPin?: boolean; error?: string; json?: Record<string, unknown> }

/** The two "Connect" buttons: FB.login with Calvy's Embedded Signup configuration, the WA_EMBEDDED_SIGNUP listener, then our server. */
export function ConnectWithCalvy({ appId, configId, coexistence, disabled, onDone }: { appId: string; configId: string; coexistence: boolean; disabled?: boolean; onDone: (o: ConnectOutcome) => void }) {
  const [busy, setBusy] = useState<"" | "existing" | "new">("");
  const session = useRef<SessionMessage | null>(null);
  const waiters = useRef<(() => void)[]>([]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = parseSessionMessage(e.origin, e.data);
      if (!m) return;
      session.current = m;
      waiters.current.splice(0).forEach((w) => w());
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Meta posts the session message around the same time as the FB.login callback, in either order: wait for it a little.
  const waitForSession = () => new Promise<SessionMessage | null>((resolve) => {
    if (session.current) return resolve(session.current);
    const t = setTimeout(() => resolve(session.current), 20_000);
    waiters.current.push(() => { clearTimeout(t); resolve(session.current); });
  });

  const start = async (coexistence: boolean) => {
    setBusy(coexistence ? "existing" : "new");
    session.current = null;
    try {
      const fb = await loadSdk(appId);
      const code = await new Promise<string | null>((resolve) => {
        fb.login((r) => resolve(r.authResponse?.code ?? null), loginOptions(configId, coexistence));
      });
      const sess = await (async () => {
        if (!code) { await new Promise((r) => setTimeout(r, 800)); return session.current; } // a cancel/error message may land just after
        return waitForSession();
      })();
      if (sess?.kind === "error") return onDone({ ok: false, error: sess.message });
      if (!code || sess?.kind === "cancel" || !sess) return onDone({ ok: false, error: "Connecting was cancelled. Nothing was changed." });
      if (!sess.phoneNumberId) return onDone({ ok: false, error: "No phone number was added in the Meta window. Press Connect and finish adding a number." });
      const res = await fetch("/api/settings/whatsapp/embedded", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, wabaId: sess.wabaId, phoneNumberId: sess.phoneNumberId, coexistence: sess.coexistence || coexistence }) });
      const json = await res.json().catch(() => ({}));
      onDone({ ok: res.ok && !!json.ok, needPin: json.needPin, wrongPin: json.wrongPin, error: json.error, json });
    } catch (e) {
      onDone({ ok: false, error: e instanceof Error ? e.message : "Could not connect. Try again." });
    } finally { setBusy(""); }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {coexistence && <Button size="sm" loading={busy === "existing"} disabled={disabled || !!busy} onClick={() => start(true)}>Connect my existing WhatsApp Business app number</Button>}
      <Button size="sm" variant={coexistence ? "outline" : "primary"} loading={busy === "new"} disabled={disabled || !!busy} onClick={() => start(false)}>Use a new number</Button>
    </div>
  );
}
