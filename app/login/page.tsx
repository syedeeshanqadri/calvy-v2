"use client";
import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import AuthShell, { inputClass, primaryBtn, secondaryBtn, linkClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendError, setResendError] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") setSuccess("Email verified! You can now sign in.");
    if (params.get("reset") === "1") setSuccess("Your password was changed. Sign in with your new password.");
    if (params.get("error") === "GoogleLinkRequired") {
      setError("An account with this email already exists. Sign in with your email and password first, then choose \"Link Google\" in Settings.");
    }
    if (params.get("error") === "GoogleDenied" || params.get("error") === "AccessDenied") {
      setError("We could not sign you in with Google. Make sure your Google email is verified, or use your email and password.");
    }
    if (params.get("error") === "expired-token") {
      setError("Your verification link has expired. Enter your email below and choose Resend verification email.");
      setCanResend(true);
    }
    if (params.get("error") === "invalid-token") {
      setError("Invalid verification link. Enter your email below and choose Resend verification email.");
      setCanResend(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setResendMsg("");
    setResendError("");
    setEmailError("");
    setCanResend(false);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error === "EmailNotVerified") {
      setError("Your email is not verified yet. Check your inbox for the verification link, or send a new one.");
      setCanResend(true);
    } else if (result?.error === "TooManyAttempts") {
      setError("Too many attempts. Please wait a minute and try again.");
    } else if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleResend() {
    setResendMsg("");
    setResendError("");
    setEmailError("");
    if (!email.trim()) {
      setEmailError("Enter your email address first.");
      document.getElementById("login-email")?.focus();
      return;
    }
    setResending(true);
    const r = await postAuth("/api/auth/resend-verification", { email: email.trim() });
    setResending(false);
    if (r.ok) setResendMsg("If that account is not verified yet, we've sent a new link.");
    else setResendError(r.message);
  }

  return (
    <AuthShell>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Welcome back</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Sign in to your business dashboard</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(""); }}
            placeholder="you@business.com"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "login-email-error" : undefined}
            className={inputClass}
          />
          {emailError && <p id="login-email-error" role="alert" className="text-sm text-red-600 mt-1.5">{emailError}</p>}
        </div>
        <PasswordInput
          id="login-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          labelAction={
            <Link href="/forgot-password" className={`${linkClass} text-sm min-h-11 inline-flex items-center`}>
              Forgot password?
            </Link>
          }
        />

        <div aria-live="polite">
          {success && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">{success}</p>}
        </div>
        <div role="alert">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        </div>

        {canResend && (
          <div className="space-y-2">
            <button type="button" onClick={handleResend} disabled={resending} className={secondaryBtn}>
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            <div role="status">
              {resendMsg && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">{resendMsg}</p>}
            </div>
            <div role="alert">
              {resendError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{resendError}</p>}
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <SocialAuthButtons callbackUrl="/dashboard" />

      <p className="text-center text-sm text-[#6b6b80] mt-6">
        No account?{" "}
        <Link href="/signup" className={linkClass}>Get started free</Link>
      </p>
    </AuthShell>
  );
}
