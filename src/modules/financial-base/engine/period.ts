/**
 * Utilidades de periodo (puras). Un periodo = un mes natural con rango de fechas
 * inclusivo, usable para filtrar transacciones (occurred_on) y para scopear el
 * presupuesto (period_month / period_year).
 */
import type { Period } from "@/modules/financial-base/types";

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Último día del mes (1-31). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Construye un periodo mensual a partir de año/mes (1-12). */
export function monthPeriod(year: number, month: number): Period {
  const m = Math.min(12, Math.max(1, month));
  const from = `${year}-${pad(m)}-01`;
  const to = `${year}-${pad(m)}-${pad(lastDayOfMonth(year, m))}`;
  return { month: m, year, from, to, label: `${MONTHS_SHORT[m - 1]} ${year}` };
}

/** Periodo del mes anterior al dado. */
export function previousMonthPeriod(p: Period): Period {
  const m = p.month === 1 ? 12 : p.month - 1;
  const y = p.month === 1 ? p.year - 1 : p.year;
  return monthPeriod(y, m);
}

/** Parsea "YYYY-MM" (o vacío) a periodo; cae al mes actual de `now`. */
export function parseMonthParam(param: string | undefined | null, now: Date): Period {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    return monthPeriod(y!, m!);
  }
  return monthPeriod(now.getFullYear(), now.getMonth() + 1);
}

/** "YYYY-MM" del periodo (para enlaces/deep-link). */
export function monthParam(p: Period): string {
  return `${p.year}-${pad(p.month)}`;
}
