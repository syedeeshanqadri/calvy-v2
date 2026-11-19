"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn, linkClass } from "@/components/auth/AuthShell";

function CancelForm() {
  const token = useSearchParams()?.get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "gone">("idle");
  async function keep() {
    setState("busy");
    try {
      const res = await fetch("/api/customer/deletion/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await res.json().catch(() => ({}));
      setState(res.ok && d.ok ? "done" : "gone");
    } catch { setState("idle"); }
  }
  if (state === "done") {
    return <><h1 className="font-syne font-bold text-2xl mb-2">Your account is staying</h1><p className="text-sm text-[#6b6b80]">The deletion request was cancelled. Nothing was removed. <Link href="/account/login" className={linkClass}>Sign in</Link></p></>;
  }
  if (state === "gone") {
    return <><h1 className="font-syne font-bold text-2xl mb-2">This link no longer works</h1><p className="text-sm text-[#6b6b80]">The request was already cancelled or carried out. <Link href="/account/login" className={linkClass}>Sign in</Link> to check your account.</p></>;
  }
  return (
    <>
      <h1 className="font-syne font-bold text-2xl mb-2">Keep your account?</h1>
      <p className="text-sm text-[#6b6b80] mb-6">You asked us to delete your Calvy account. Cancel the request and everything stays as it is.</p>
      <button type="button" onClick={keep} disabled={state === "busy" || !token} className={primaryBtn}>{state === "busy" ? "Cancelling…" : "Keep my account"}</button>
    </>
  );
}

export default function DeletionCancelPage() {
  return <AuthShell><Suspense fallback={null}><CancelForm /></Suspense></AuthShell>;
}
