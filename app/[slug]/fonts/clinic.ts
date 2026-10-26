// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Instrument_Sans } from "next/font/google";

export const font = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-st-display" });
