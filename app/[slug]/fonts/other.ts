// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Onest } from "next/font/google";

export const font = Onest({ subsets: ["latin"], display: "swap", variable: "--font-st-display" });
