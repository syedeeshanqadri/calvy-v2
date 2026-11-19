"use client";
import "@/lib/zodConfig"; // before anything parses with zod: no `new Function` probe (CSP)
import { SessionProvider } from "next-auth/react";
import { RouteProgress } from "@/components/RouteProgress";
import { useSubmitGuard } from "@/components/useSubmitGuard";

export function Providers({ children }: { children: React.ReactNode }) {
  useSubmitGuard();
  return <SessionProvider><RouteProgress />{children}</SessionProvider>;
}
