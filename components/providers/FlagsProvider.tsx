"use client";
import { createContext, useContext } from "react";
import type { FeatureFlag } from "@/lib/flags";

export type FlagState = Record<FeatureFlag, boolean>;

const ALL_OFF: FlagState = {
  wallet: false,
  payments: false,
  chatWidget: false,
  broadcasts: false,
  demoBooking: false,
  removeBranding: false,
};

const FlagsContext = createContext<FlagState>(ALL_OFF);

/** Flags are computed on the server and passed in, so hidden items never flash. */
export function FlagsProvider({ flags, children }: { flags: FlagState; children: React.ReactNode }) {
  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

export function useFlags(): FlagState {
  return useContext(FlagsContext);
}
