// Loaded only for tenant sites (see ./index.ts). next/font self-hosts it: latin subset, swap.
import { Archivo } from "next/font/google";

export const font = Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--font-st-display" });
