// Loaded only for tenant sites (see ./index.ts). Self-hosted variable woff2 (latin subset, OFL; licence in app/fonts/licenses).
import localFont from "next/font/local";

// A distinct const name matters: next/font derives the CSS family name from it, and tenant pages load two fonts.
const familjenGrotesk = localFont({ src: "../../fonts/familjen-grotesk.woff2", weight: "100 900", display: "swap", preload: false, variable: "--font-st-display" });

export const font = familjenGrotesk;
