"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { primaryBtn } from "@/components/auth/AuthShell";

/**
 * One button, on purpose. Opening the page does nothing: mail scanners and link previews load URLs, and must not spend the one-time token.
 * The token is spent only when the person presses the button.
 */
export default function MagicClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"ask" | "working" | "bad">("ask");
  async function go() {
    setState("working");
    const r = await signIn("magic-link", { token, redirect: false });
    if (r?.error || !r?.ok) { setState("bad"); return; }
    router.push("/dashboard"); // the dashboard sends an owner who has not finished setup straight back into onboarding
    router.refresh();
  }
  if (!token || state === "bad") {
    return (
      <>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">This link has expired or was already used</h1>
        <p className="text-sm text-[#6b6b80] mb-6">Sign-in links work once and last a short while. Ask for a new one on the sign-in page.</p>
        <Link href="/login" className={primaryBtn}>Go to sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Continue to Calvy</h1>
      <p className="text-sm text-[#6b6b80] mb-6">Press the button to sign in. No password needed.</p>
      <button type="button" onClick={go} disabled={state === "working"} className={primaryBtn}>{state === "working" ? "Signing you in…" : "Sign in"}</button>
    </>
  );
}
