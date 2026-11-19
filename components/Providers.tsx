"use client";
import "@/lib/zodConfig"; // before anything parses with zod: no `new Function` probe (CSP)
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
