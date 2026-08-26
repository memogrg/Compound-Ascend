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

export async function getSurplusDecision(): Promise<SurplusDecisionReport> {
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
  const selected = expensive ?? [...active].sort((a, b) => live(b) - live(a))[0] ?? null;

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

  return { ...comparison, currency, fundsCovered, debtName: selected?.name ?? null };
}
