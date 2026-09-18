import type { VendorId } from "./types.ts";

/**
 * Guarda de costo del colector.
 *
 * Cuenta CRÉDITOS, no requests: es lo que factura cada plan. En Twelve Data un lote de 20
 * símbolos es una request y 20 créditos; en CoinGecko, Massive y Finnhub cada request es uno.
 *
 * El colector es un proceso nuevo por corrida y no hay dónde guardar un acumulado sin migración,
 * así que el "diario" es una PROYECCIÓN: lo que gastó esta corrida × corridas por día. Es exacto
 * mientras la cantidad de símbolos no cambie a mitad del día, y avisa ANTES de pasarse — que es
 * para lo que sirve un tope.
 *
 * Lo que NO ve: el consumo del camino en vivo (Vercel), que usa la llave de Vercel y, si es el
 * mismo plan, gasta del mismo cupo. Por eso el umbral por defecto es 80% y no 100%.
 */
export function createBudget() {
  const creditos = new Map<VendorId, number>();
  return {
    charge(vendor: VendorId, credits: number) {
      creditos.set(vendor, (creditos.get(vendor) ?? 0) + credits);
    },
    snapshot(): Record<string, number> {
      return Object.fromEntries(creditos);
    },
  };
}

export type BudgetConfig = {
  runsPerDay: number;
  warnRatio: number;
  /** Créditos por día que da el plan. Para planes mensuales, cupo mensual ÷ 30. */
  dailyBudget: Partial<Record<VendorId, number>>;
};

export type BudgetLine = {
  vendor: string;
  creditos: number;
  proyectadoDia: number;
  topeDia: number | null;
  pct: number | null;
  nivel: "ok" | "aviso" | "excedido" | "sin-tope";
};

function num(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * `MARKET_BUDGET_DAILY_<PROVEEDOR>` (créditos/día del plan), `MARKET_BUDGET_WARN_RATIO` (0.8) y
 * `MARKET_RUNS_PER_DAY` (24: el cron es horario). Un proveedor sin tope se reporta igual, sin
 * alarma — Massive Starter, por ejemplo, no tiene límite de llamadas.
 */
export function budgetConfigFromEnv(env: Record<string, string | undefined>): BudgetConfig {
  const dailyBudget: Partial<Record<VendorId, number>> = {};
  for (const id of ["massive", "twelvedata", "finnhub", "coingecko"] as const) {
    const v = num(env[`MARKET_BUDGET_DAILY_${id.toUpperCase()}`], 0);
    if (v > 0) dailyBudget[id] = v;
  }
  const ratio = num(env.MARKET_BUDGET_WARN_RATIO, 0.8);
  return {
    runsPerDay: num(env.MARKET_RUNS_PER_DAY, 24),
    warnRatio: ratio > 1 ? 1 : ratio,
    dailyBudget,
  };
}

export function budgetReport(creditos: Record<string, number>, cfg: BudgetConfig): BudgetLine[] {
  return Object.entries(creditos).map(([vendor, c]) => {
    const proyectadoDia = c * cfg.runsPerDay;
    const tope = cfg.dailyBudget[vendor as VendorId] ?? null;
    if (tope === null) {
      return { vendor, creditos: c, proyectadoDia, topeDia: null, pct: null, nivel: "sin-tope" };
    }
    const pct = proyectadoDia / tope;
    const nivel = pct >= 1 ? "excedido" : pct >= cfg.warnRatio ? "aviso" : "ok";
    return { vendor, creditos: c, proyectadoDia, topeDia: tope, pct, nivel };
  });
}
