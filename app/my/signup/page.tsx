"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { inputClass, primaryBtn, linkClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

function SignupForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params?.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const r = await postAuth("/api/customer/signup", { name: name.trim(), email: email.trim(), password });
    setLoading(false);
    if (r.ok) setSent(true);
    else setError(r.message);
  }

  if (sent) {
    return (
      <div role="status">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Check your email</h1>
        <p className="text-[#6b6b80] text-sm mb-6">
          We sent a link to <strong>{email}</strong>. Open it and enter the password you just chose to verify your email. Your bookings show up once it is verified.
        </p>
        <Link href={`/my/login?email=${encodeURIComponent(email)}`} className={primaryBtn}>Go to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Track your bookings</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Create a free account to see your appointments, tokens and wallet across businesses. Booking never needs an account.</p>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="cs-name" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Your name</label>
          <input id="cs-name" required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="cs-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
          <input id="cs-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
        </div>
        <PasswordInput id="cs-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Creating…" : "Create account"}</button>
      </form>
      <SocialAuthButtons googleProvider="google-customer" callbackUrl="/my" />
      <p className="text-sm text-[#6b6b80] mt-6">Already have one? <Link href="/my/login" className={linkClass}>Sign in</Link></p>
    </>
  );
}

export default function CustomerSignupPage() {
  return <AuthShell><Suspense fallback={null}><SignupForm /></Suspense></AuthShell>;
}
