// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Newsreader } from "next/font/google";

export const font = Newsreader({ subsets: ["latin"], display: "swap", variable: "--font-st-display" });
