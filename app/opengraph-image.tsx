import { ImageResponse } from "next/og";

export const alt = "Calvy: free website and online booking page for clinics, salons, lawyers and more";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// One share image for every page that does not set its own (Open Graph and Twitter cards).
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0c4a6e 0%, #0284c7 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>Calvy</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Your website and booking page, free.</div>
          <div style={{ fontSize: 34, opacity: 0.9 }}>Time slots and tokens · WhatsApp, email and push alerts · Online payments</div>
        </div>
        <div style={{ fontSize: 30, opacity: 0.85 }}>For clinics, salons, lawyers, fitness studios and consultants</div>
      </div>
    ),
    size,
  );
}
