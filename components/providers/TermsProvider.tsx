"use client";
import { createContext, useContext, useMemo } from "react";
import { getPack } from "@/lib/packs";
import { t as resolve, type TermOpts, type TermsSource } from "@/lib/terms";
import type { TermKey } from "@/lib/packs/types";

type DashboardSource = TermsSource & { bookingMode?: string };
const TermsContext = createContext<DashboardSource>({});

/** Gives client components the business's pack + termsOverride (server layouts pass them in). */
export function TermsProvider({ packId, termsOverride, bookingMode, children }: TermsSource & { bookingMode?: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ packId, termsOverride, bookingMode }), [packId, termsOverride, bookingMode]);
  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
}

/** const { t, pack } = useTerms();  t("client", { plural: true, cap: true }) */
export function useTerms() {
  const source = useContext(TermsContext);
  return useMemo(() => ({
    t: (key: TermKey, opts?: TermOpts) => resolve(source, key, opts),
    pack: getPack(source.packId),
    source,
    tokenMode: source.bookingMode === "TOKEN",
  }), [source]);
}
