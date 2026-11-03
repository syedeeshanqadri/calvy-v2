"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import AuthShell, { inputClass, primaryBtn, linkClass } from "@/components/auth/AuthShell";
import { PackPicker } from "@/components/packs/PackPicker";
import type { PackId } from "@/lib/packs/types";
import { detectRegion } from "@/lib/onboarding";

/** Passwordless sign-up: name, email, phone (required in India) and business type. The emailed link verifies the address and sets the password. */
export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [packId, setPackId] = useState<PackId | "">("");
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false); // account made, but the automatic sign-in failed: fall back to "check your email"

  useEffect(() => {
    setPhoneRequired(detectRegion(Intl.DateTimeFormat().resolvedOptions().timeZone) === "IN");
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!packId) { setError("Please choose your business type."); return; }
    setLoading(true);

    let res: Response;
    let data: { error?: string; ticket?: string } = {};
    try {
      res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, packId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setLoading(false);
      setError("We could not reach the server. Check your connection and try again.");
      return;
    }
    if (!res.ok || !data.ticket) {
      setLoading(false);
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }

    // Straight into the wizard; verifying the email can wait.
    const r = await signIn("signup-ticket", { ticket: data.ticket, redirect: false });
    setLoading(false);
    if (r?.error) { setDone(true); return; }
    router.push("/onboarding");
    router.refresh();
  }

  if (done) {
    return (
      <AuthShell className="text-center">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Check your email</h1>
        <p className="text-[#6b6b80] text-sm mb-1">We sent a link to</p>
        <p className="font-semibold text-[#0f0f1a] text-sm mb-6 break-all">{form.email}</p>
        <p className="text-sm text-[#6b6b80] mb-5">Open it to verify your email and set your password, then sign in.</p>
        <Link href="/login" className={primaryBtn}>Go to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Create your account</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Get your website in under 10 minutes. No password needed now.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Your name</label>
          <input id="signup-name" type="text" required autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Alex Johnson" className={inputClass} />
        </div>
        <div>
          <label htmlFor="signup-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
          <input id="signup-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@business.com" className={inputClass} />
        </div>
        <div>
          <label htmlFor="signup-phone" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">
            Phone number {!phoneRequired && <span className="text-[#6b6b80] font-normal">(optional)</span>}
          </label>
          <input id="signup-phone" type="tel" required={phoneRequired} autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={phoneRequired ? "+91 98765 43210" : "+1 555 000 0000"} className={inputClass} />
        </div>

        <PackPicker value={packId as PackId} onChange={setPackId} legend="What kind of business is it?" name="signup-pack" />

        <div role="alert">{error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}</div>

        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Creating your account…" : "Get started"}</button>
      </form>

      <SocialAuthButtons callbackUrl="/onboarding" providers={["google"]} />

      <p className="text-center text-xs text-[#6b6b80] mt-4">
        By signing up you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
      <p className="text-center text-sm text-[#6b6b80] mt-5 pt-5 border-t border-[#f0ede8]">
        Already have an account? <Link href="/login" className={linkClass}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
