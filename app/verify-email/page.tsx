"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn, secondaryBtn } from "@/components/auth/AuthShell";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error" | "expired">("verifying");

  useEffect(() => {
    document.title = "Verify your email | Calvy";
  }, []);

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.redirected) {
          const url = new URL(res.url);
          const err = url.searchParams.get("error");
          if (err === "expired-token") setStatus("expired");
          else if (err === "invalid-token") setStatus("error");
          else setStatus("success");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="text-center" aria-live="polite">
      {status === "verifying" && (
        <>
          <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
            <svg className="animate-spin w-8 h-8 text-sky-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">Verifying your email…</h1>
          <p className="text-sm text-[#6b6b80]">Please wait a moment.</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">Email verified!</h1>
          <p className="text-sm text-[#6b6b80] mb-6">Your account is now active. You can sign in.</p>
          <Link href="/login" className={primaryBtn}>
            Sign in to your dashboard
          </Link>
        </>
      )}

      {status === "expired" && (
        <>
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">Link expired</h1>
          <p className="text-sm text-[#6b6b80] mb-6">Your verification link has expired. We can send you a new one.</p>
          <Link href="/login?error=expired-token" className={primaryBtn}>
            Send a new verification link
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">Invalid link</h1>
          <p className="text-sm text-[#6b6b80] mb-6">This verification link is not valid or has already been used. If your account is not verified yet, we can send you a new link.</p>
          <div className="space-y-3">
            <Link href="/login?error=expired-token" className={primaryBtn}>
              Send a new verification link
            </Link>
            <Link href="/signup" className={secondaryBtn}>
              Sign up again
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-sm text-[#6b6b80] text-center">Loading…</p>}>
        <VerifyEmailInner />
      </Suspense>
    </AuthShell>
  );
}
