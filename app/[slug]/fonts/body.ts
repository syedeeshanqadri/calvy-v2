// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Figtree } from "next/font/google";

export const font = Figtree({ subsets: ["latin"], display: "swap", variable: "--font-st-body" });
