"use client";

/**
 * Contexto de monedas del dashboard. El layout (server) resuelve las dos:
 *  - primary: moneda principal del usuario (getPrimaryCurrency). ESTABLE.
 *  - display: moneda de visualización del topbar (getDisplayCurrency, cookie).
 *
 * Regla del proyecto: la captura de montos usa SIEMPRE la principal como
 * default (estable), nunca la de visualización. La de visualización solo afecta
 * cómo se muestran los agregados. Por eso los formularios leen useCaptureCurrency().
 */
import { createContext, useContext } from "react";

export type Currencies = { primary: string; display: string };

const FALLBACK: Currencies = { primary: "CRC", display: "CRC" };

const CurrencyContext = createContext<Currencies>(FALLBACK);

export function CurrencyProvider({
  value,
  children,
}: {
  value: Currencies;
  children: React.ReactNode;
}) {
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Ambas monedas del dashboard (primary + display). */
export function useCurrencies(): Currencies {
  return useContext(CurrencyContext);
}

/**
 * Moneda por defecto para capturar un monto nuevo: la principal del usuario.
 * Nunca la de visualización. Al editar, el formulario debe usar item.currency.
 */
export function useCaptureCurrency(): string {
  return useContext(CurrencyContext).primary;
}
