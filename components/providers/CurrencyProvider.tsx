"use client";
import { createContext, useContext } from "react";
import { formatCurrencyAmount, CURRENCIES } from "@/lib/currency";

interface CurrencyContextValue {
  currency: string;
  currencySymbol: string;
  formatPrice: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  currencySymbol: "$",
  formatPrice: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v),
});

export function CurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  // Prices in DB are stored in the business's own currency — just format, no conversion.
  const formatPrice = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <CurrencyContext.Provider value={{ currency, currencySymbol, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
