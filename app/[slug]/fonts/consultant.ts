// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Familjen_Grotesk } from "next/font/google";

export const font = Familjen_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-st-display" });
