// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Bodoni_Moda } from "next/font/google";

export const font = Bodoni_Moda({ subsets: ["latin"], display: "swap", variable: "--font-st-display" });
