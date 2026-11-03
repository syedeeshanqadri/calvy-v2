"use client";
import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

export type PhotoPurpose = "gallery" | "team" | "service";

/** Upload one photo through /api/upload (cropped, quota-checked, stored by the storage adapter). */
export async function uploadSitePhoto(file: File, purpose: PhotoPurpose): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", purpose);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
  return data.url;
}

export function PhotoField({ label, value, onChange, purpose, square = false }: {
  label: string; value: string; onChange: (url: string) => void; purpose: PhotoPurpose; square?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try { onChange(await uploadSitePhoto(file, purpose)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <span className="block text-sm font-medium text-brand-700 mb-1.5">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`relative overflow-hidden rounded-xl border border-[#e8e6e0] bg-[#f8f7f4] flex items-center justify-center ${square ? "w-20 h-20" : "w-28 h-20"}`}>
          {value ? <Image src={value} alt="" fill sizes="112px" className="object-cover" unoptimized /> : <ImageIcon size={20} className="text-[#c5c3bf]" aria-hidden />}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="relative overflow-hidden px-3 py-2 min-h-[40px] inline-flex items-center rounded-lg border border-[#e8e6e0] text-xs font-semibold hover:bg-[#f8f7f4] cursor-pointer focus-within:ring-2 focus-within:ring-accent/30">
            {busy ? "Uploading…" : value ? "Change photo" : "Upload photo"}
            <input type="file" accept="image/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {value && <button type="button" onClick={() => onChange("")} className="text-xs text-[#6b6b80] underline text-left">Remove</button>}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
