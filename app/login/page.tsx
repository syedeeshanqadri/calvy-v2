"use client";
import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") setSuccess("Email verified! You can now sign in.");
    if (params.get("error") === "expired-token") setError("Your verification link has expired. Please sign up again.");
    if (params.get("error") === "invalid-token") setError("Invalid verification link. Please sign up again.");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error === "EmailNotVerified") {
      setError("Please verify your email first. Check your inbox for the verification link.");
    } else if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Image src="/calvy.svg" alt="Calvy" width={120} height={35} className="brightness-0 invert" />
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Welcome back</h1>
          <p className="text-[#6b6b80] text-sm mb-7">Sign in to your business dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
              />
            </div>

            {success && (
              <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">{success}</p>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0284c7] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[#0369a1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <SocialAuthButtons callbackUrl="/dashboard" />

          <p className="text-center text-sm text-[#6b6b80] mt-6">
            No account?{" "}
            <Link href="/signup" className="text-[#0284c7] font-semibold hover:underline">
              Get started free
            </Link>
          </p>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">© 2026 Calvy · All rights reserved</p>
      </div>
    </div>
  );
}
