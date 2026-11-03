"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { inputClass, primaryBtn, linkClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params?.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const e = params?.get("error");
    if (e === "GoogleLinkRequired") return "An account with this email already exists. Sign in with your password first, then choose \"Link Google\" on your Profile page.";
    if (e === "GoogleDenied" || e === "AccessDenied") return "We could not sign you in with Google. Make sure your Google email is verified, or use your email and password.";
    return "";
  });
  const [notice, setNotice] = useState(params?.get("reset") === "1" ? "Your password was changed. Sign in with your new password." : params?.get("verified") === "1" ? "Email verified. Sign in to see your bookings." : "");
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice(""); setCanResend(false); setLoading(true);
    const result = await signIn("customer", { email, password, redirect: false });
    setLoading(false);
    if (result?.error === "EmailNotVerified") {
      setError("Your email is not verified yet. Check your inbox for the link, or send a new one.");
      setCanResend(true);
    } else if (result?.error === "TooManyAttempts") setError("Too many attempts. Please wait a minute and try again.");
    else if (result?.error) setError("Invalid email or password.");
    else { router.push("/my"); router.refresh(); }
  }

  async function resend() {
    const r = await postAuth("/api/customer/resend-verification", { email: email.trim() });
    setNotice(r.ok ? "If that account needs verifying, a new link is on its way." : r.message);
  }

  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Sign in to your bookings</h1>
      <p className="text-[#6b6b80] text-sm mb-7">See your appointments, tokens and wallet in one place.</p>
      {notice && <p role="status" className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-4">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="c-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
          <input id="c-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
        </div>
        <PasswordInput id="c-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password"
          labelAction={<Link href="/my/forgot-password" className={`${linkClass} text-xs`}>Forgot password?</Link>} />
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Signing in…" : "Sign in"}</button>
        {canResend && <button type="button" onClick={resend} className={`${linkClass} text-sm`}>Send a new verification email</button>}
      </form>
      <SocialAuthButtons googleProvider="google-customer" callbackUrl="/my" />
      <p className="text-sm text-[#6b6b80] mt-6">No account yet? <Link href={`/my/signup${email ? `?email=${encodeURIComponent(email)}` : ""}`} className={linkClass}>Create one</Link></p>
    </>
  );
}

export default function CustomerLoginPage() {
  return <AuthShell><Suspense fallback={null}><LoginForm /></Suspense></AuthShell>;
}
