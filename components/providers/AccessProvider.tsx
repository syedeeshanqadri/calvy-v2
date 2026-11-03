"use client";
import { createContext, useContext } from "react";
import { pathAllowed } from "@/lib/permissions";

export interface AccessState { isOwner: boolean; permissions: string[] }

// Owners see everything. A member sees only what their ticked permissions open.
// This only decides what to SHOW; the server enforces every route (lib/access.ts).
const AccessContext = createContext<AccessState>({ isOwner: true, permissions: [] });

export function AccessProvider({ value, children }: { value: AccessState; children: React.ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessState & { allows: (href: string) => boolean } {
  const a = useContext(AccessContext);
  return { ...a, allows: (href) => a.isOwner || pathAllowed(a.permissions, href) };
}
