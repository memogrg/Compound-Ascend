/**
 * Utilidades de periodo (puras). Un periodo = un mes natural con rango de fechas
 * inclusivo, usable para filtrar transacciones (occurred_on) y para scopear el
 * presupuesto (period_month / period_year).
 */
import type { Period } from "@/modules/financial-base/types";

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
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

/**
 * Parsea "YYYY-MM" (o vacío) a periodo; si el param no es válido, cae a `fallback`.
 *
 * El fallback es un `Period` YA construido (el mes actual del usuario, vía
 * `userCurrentPeriod()`), NO un `Date`: derivar el mes de un `Date` aquí usaría los
 * getters locales del servidor (UTC en Vercel) y rompería la zona del usuario.
 */
export function parseMonthParam(param: string | undefined | null, fallback: Period): Period {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    return monthPeriod(y!, m!);
  }
  return fallback;
}

/** "YYYY-MM" del periodo (para enlaces/deep-link). */
export function monthParam(p: Period): string {
  return `${p.year}-${pad(p.month)}`;
}

// ── Rango de agregación (tab Ingresos · Fase 1) ───────────────────────────
// Controla la ventana del histórico y la agregación de los cuadros. "all" se
// resuelve a meses concretos en el loader (desde la transacción más antigua).
export type RangeKey = "1m" | "3m" | "6m" | "1y" | "3y" | "all";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "1m", label: "1 mes" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "1y", label: "1 año" },
  { value: "3y", label: "3 años" },
  { value: "all", label: "Todo el tiempo" },
];

const RANGE_MONTHS: Record<RangeKey, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
  "3y": 36,
  all: 120, // tope; el loader lo ajusta a la transacción más antigua.
};

/** Parsea "?range=" a un RangeKey válido; cae a "1m". */
export function parseRangeParam(param: string | undefined | null): RangeKey {
  return RANGE_OPTIONS.some((o) => o.value === param) ? (param as RangeKey) : "1m";
}

/** Meses hacia atrás (incluyendo el periodo actual) que cubre un rango. */
export function rangeToMonths(range: RangeKey): number {
  return RANGE_MONTHS[range];
}

/** ¿El periodo es el mes natural en curso? `todayIso` = "YYYY-MM-DD" en la zona del
 *  usuario: `userToday()` en el servidor, `useCaptureToday()` en el cliente. Con la del
 *  servidor a secas sería UTC y el mes cambiaría antes de tiempo. */
export function isCurrentMonth(period: { year: number; month: number }, todayIso: string): boolean {
  return (
    period.year === Number(todayIso.slice(0, 4)) && period.month === Number(todayIso.slice(5, 7))
  );
}

/** Modelo del marcador de cierre de mes (Trazabilidad Fase C). */
export type MonthMarker = {
  /** true = mes en curso (tono acento); false = mes cerrado (tono neutro). */
  isCurrent: boolean;
  /** "Julio en curso" | "Cierre de julio 2026". */
  title: string;
  /** Flujo del mes (freeCashflowReal): la superficie lo formatea y colorea por signo. */
  flow: number;
  /** Liquidez del periodo (hoy si en curso; al cierre si cerrado). */
  liquidity: number;
  /** "liquidez hoy" | "liquidez al cierre". */
  liquidityLabel: string;
};

/**
 * Construye el marcador de cierre de mes (puro). La superficie formatea importes
 * (moneda), colorea el flujo (verde ≥ 0 / rojo < 0) y elige el tono por `isCurrent`.
 * Compartido por web y móvil para no duplicar la lógica.
 */
export function buildMonthMarker(args: {
  period: { year: number; month: number };
  flow: number;
  liquidity: number;
  todayIso: string;
}): MonthMarker {
  const isCurrent = isCurrentMonth(args.period, args.todayIso);
  const mes = MONTHS_LONG[args.period.month - 1] ?? "";
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  return {
    isCurrent,
    title: isCurrent ? `${mesCap} en curso` : `Cierre de ${mes} ${args.period.year}`,
    flow: args.flow,
    liquidity: args.liquidity,
    liquidityLabel: isCurrent ? "liquidez hoy" : "liquidez al cierre",
  };
}
