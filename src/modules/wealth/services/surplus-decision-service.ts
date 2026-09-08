import "server-only";

/**
 * Datos reales para la decisión del excedente (F3). Precondición: los fondos de defensa YA
 * están cubiertos (F1). El excedente = flujo libre mensual. Elige la deuda a comparar (la cara
 * gatilla el aviso de "pagala primero"; si no, la de mayor saldo — la hipoteca) y delega al
 * engine puro compareSurplus. Todo en la moneda de DISPLAY. La app informa, no ordena.
 */
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import {
  listDebts,
  getCurrentDebtBalances,
  compareExtra,
  type AmortizationInput,
} from "@/modules/control";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { getDefenseFundsReport } from "@/modules/wealth/services/fund-sizing-service";
import {
  compareSurplus,
  DEBT_INVEST_THRESHOLD,
  type SurplusComparison,
} from "@/modules/wealth/engine/surplus-decision";

export type SurplusDecisionReport = SurplusComparison & {
  currency: string;
  /** ¿Los fondos de defensa (emergencia+paz) ya están cubiertos? Si no, F3 aún no aplica. */
  fundsCovered: boolean;
  /** Nombre de la deuda comparada (para el copy), si hay. */
  debtName: string | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * @param debtId Deuda contra la que comparar. Sin él (el caso de siempre) la elige la regla:
 *   la cara manda, si no la de mayor saldo. Se agregó para que "Mis acciones → Decisiones"
 *   deje comparar contra OTRA deuda activa sin cambiar en nada el comportamiento por defecto:
 *   un id que no exista o esté saldado cae de vuelta en la elección automática.
 */
export async function getSurplusDecision(debtId?: string): Promise<SurplusDecisionReport> {
  const [funds, base, currency, debts, liveBalances, rates] = await Promise.all([
    getDefenseFundsReport(),
    getBaseSummary(),
    getDisplayCurrency(),
    listDebts(),
    getCurrentDebtBalances(),
    getFxRates(),
  ]);

  const fundsCovered = funds.activeFund === "done";
  const surplus = Math.max(0, base.indicators.freeCashflow ?? 0); // ya en moneda de display

  // Saldo VIVO por deuda (ancla − pagos), NO el ancla de alta: una deuda saldada (≤0) no gatilla
  // "pagala primero" ni se elige para el abono. `listDebts` aporta los campos de amortización;
  // el saldo con el que se filtra/elige/alimenta es el derivado (P2 deuda-saldada).
  const liveById = new Map(liveBalances.map((d) => [d.id, d.currentBalance]));
  const live = (d: (typeof debts)[number]): number => liveById.get(d.id) ?? 0;

  const active = debts.filter((d) => live(d) > 0);
  // La deuda cara (APR > umbral) manda: gatilla "pagala primero". Si no hay, la de mayor saldo
  // (la hipoteca) es el objetivo natural del abono extra.
  const expensive = [...active]
    .sort((a, b) => Number(b.apr ?? 0) - Number(a.apr ?? 0))
    .find((d) => Number(d.apr ?? 0) / 100 > DEBT_INVEST_THRESHOLD);
  // Elección explícita (Decisiones): solo si la deuda existe y sigue viva. Si no, la regla.
  const chosen = debtId ? active.find((d) => d.id === debtId) : undefined;
  const selected = chosen ?? expensive ?? [...active].sort((a, b) => live(b) - live(a))[0] ?? null;

  const conv = (n: number, from: string) => convertCurrency(n, from, currency, rates);
  const debtInput: AmortizationInput | null = selected
    ? {
        balance: conv(live(selected), selected.currency),
        apr: Number(selected.apr ?? 0),
        termMonths: selected.termMonths ?? null,
        monthlyPayment:
          selected.currentPayment != null
            ? conv(Number(selected.currentPayment), selected.currency)
            : null,
        insurance:
          selected.insurance != null ? conv(Number(selected.insurance), selected.currency) : null,
        introApr: selected.introApr ?? null,
        introFixedMonths: selected.introFixedMonths ?? null,
      }
    : null;

  const horizonYears = selected?.termMonths ? clamp(selected.termMonths / 12, 1, 30) : 10;

  // Lado ABONAR (certeza) con el motor de amortización de control (vía barrel).
  const pay = debtInput
    ? (() => {
        const c = compareExtra(debtInput, surplus, horizonYears);
        return { interestSaved: c.interestSaved, monthsSaved: c.monthsSaved };
      })()
    : null;
  const apr = debtInput ? debtInput.apr / 100 : null; // % → decimal

  const comparison = compareSurplus({ monthlySurplus: surplus, horizonYears, apr, pay });

  // La regla del 12% mira la CARTERA, no la deuda que se eligió mirar. Sin esto, elegir la
  // hipoteca al 8% teniendo una tarjeta al 24% destaparía la comparación de inversión — la
  // regla se saltaría con un cambio de selector. En el camino por defecto no cambia nada
  // (la elección automática ya es la cara, así que `comparison.gated` ya venía en true).
  const gated = comparison.gated || expensive != null;

  return {
    ...comparison,
    gated,
    invest: gated ? [] : comparison.invest,
    currency,
    fundsCovered,
    debtName: selected?.name ?? null,
  };
}
