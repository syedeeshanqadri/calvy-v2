// Loaded only for tenant sites (see ./index.ts). Self-hosted variable woff2 (latin subset, OFL; licence in app/fonts/licenses).
import localFont from "next/font/local";

export const font = localFont({ src: "../../fonts/familjen-grotesk.woff2", weight: "100 900", display: "swap", variable: "--font-st-display" });
