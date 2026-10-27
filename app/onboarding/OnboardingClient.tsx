"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Logo } from "@/components/ui/Logo";
import { PackPicker } from "@/components/packs/PackPicker";
import type { PackId } from "@/lib/packs/types";
import { REGIONS } from "@/lib/regions";


export default function OnboardingClient({ name }: { name: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [businessName, setBusinessName] = useState("");
  const [region, setRegion] = useState("");
  const [packId, setPackId] = useState<PackId>("OTHER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) { setError("Please enter your business name."); return; }
    if (!region) { setError("Please select your country or region."); return; }
    setError("");
    setLoading(true);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, region, packId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      setLoading(false);
      return;
    }

    // Refresh the session token so it picks up the new businessId, then enter.
    await update();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo width={110} className="brightness-0 invert" />
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-xl">
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">
            {name ? `Welcome, ${name.split(" ")[0]}!` : "Almost there!"}
          </h1>
          <p className="text-sm text-[#6b6b80] mb-6">Just a couple of details to set up your workspace.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Business name</label>
              <input
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Glow Beauty Studio"
                className="w-full h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Country / region</label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              >
                <option value="">Select your country…</option>
                {REGIONS.map(r => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>

            <PackPicker value={packId} onChange={setPackId} name="onboarding-pack" />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Setting up…" : "Finish setup"}
            </button>
          </form>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full mt-3 text-xs text-[#6b6b80] hover:text-[#0f0f1a] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
