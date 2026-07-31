/**
 * Agregación por NATURALEZA de inversión (piloto Inicio · Delta 1) — motor puro.
 *
 * La ficha de Inversiones pide una dona "largo plazo (growth) vs flujo de caja
 * (cashflow)". La naturaleza ya existe por holding (`InvestmentNature`); aquí sólo
 * se suma el VALOR de mercado por naturaleza. `analytics.allocation` no sirve para
 * esto: agrupa por bucket de activo (etf/stock/crypto), no por naturaleza.
 */
import type { InvestmentNature } from "@/modules/wealth/types";

/** Entrada mínima: naturaleza + valor de mercado (ya normalizado a la moneda de display). */
export type NatureInput = { nature: InvestmentNature | null; value: number };

export type NatureSlice = { value: number; pct: number };

export type NatureBreakdown = {
  /** growth: plusvalía / largo plazo. */
  growth: NatureSlice;
  /** cashflow: genera ingreso. */
  cashflow: NatureSlice;
  /** Sin naturaleza asignada (holding viejo sin clasificar). */
  sinClasificar: NatureSlice;
  total: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregateHoldingsByNature(items: NatureInput[]): NatureBreakdown {
  let growth = 0;
  let cashflow = 0;
  let sinClasificar = 0;
  for (const it of items) {
    const v = it.value > 0 ? it.value : 0;
    if (it.nature === "growth") growth += v;
    else if (it.nature === "cashflow") cashflow += v;
    else sinClasificar += v;
  }
  const total = growth + cashflow + sinClasificar;
  const slice = (v: number): NatureSlice => ({
    value: round2(v),
    pct: total > 0 ? round2(v / total) : 0,
  });
  return {
    growth: slice(growth),
    cashflow: slice(cashflow),
    sinClasificar: slice(sinClasificar),
    total: round2(total),
  };
}
