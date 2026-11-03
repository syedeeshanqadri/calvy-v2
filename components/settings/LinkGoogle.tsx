"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/** "Link Google" for a logged-in owner. Never links silently: this button is the only way to link an existing password account. */
export function LinkGoogle({ endpoint = "/api/account/google", provider = "google", callbackUrl = "/dashboard/settings?google=linked", className = "p-5 mb-4" }: { endpoint?: string; provider?: string; callbackUrl?: string; className?: string }) {
  const [state, setState] = useState<{ enabled: boolean; linked: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(endpoint).then((r) => (r.ok ? r.json() : null)).then(setState).catch(() => {});
  }, []);

  if (!state?.enabled) return null;

  async function link() {
    setBusy(true);
    setError("");
    const r = await fetch(endpoint, { method: "POST" });
    if (!r.ok) {
      setBusy(false);
      setError((await r.json().catch(() => ({}))).error ?? "Could not start linking.");
      return;
    }
    await signIn(provider, { callbackUrl });
  }

  return (
    <Card className={className}>
      <h3 className="font-semibold text-sm mb-1">Google sign-in</h3>
      {state.linked ? (
        <p className="text-sm text-[#6b6b80]">Google is linked. You can sign in with Google or your password.</p>
      ) : (
        <>
          <p className="text-sm text-[#6b6b80] mb-3">Link your Google account to sign in with one click. It must use the same email address as this account.</p>
          <Button size="sm" variant="outline" onClick={link} disabled={busy}>{busy ? "Opening Google…" : "Link Google"}</Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </Card>
  );
}
