import "server-only";

/**
 * View-model del detalle de una deuda: saldo recalculado desde los pagos
 * reportados (fuente de la verdad), tabla de amortización completa y pagos.
 * Montos normalizados a la moneda principal; el motor (puro) corre tanto aquí
 * como en el cliente para la calculadora de escenarios.
 */
import { getDebt, listDebtPayments } from "@/modules/control/services/control-service";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { buildSchedule, recomputeFromPayments } from "@/modules/control/engine/amortization";
import type { ScheduleRow } from "@/modules/control/engine/amortization";
import type { Debt, DebtPayment, DebtRateType, DebtRateIndex } from "@/modules/control/types";

function effectiveApr(d: Debt, indexRates?: Record<string, number>): number {
  if (d.rateType === "variable" && d.rateIndex && d.rateSpread != null) {
    const idx = indexRates?.[d.rateIndex];
    if (idx != null) return idx + d.rateSpread;
  }
  return d.apr ?? 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DebtDetailVM {
  id: string;
  name: string;
  debtType: string | null;
  currency: string;
  rateType: DebtRateType | null;
  rateIndex: DebtRateIndex | null;
  rateSpread: number | null;
  apr: number;
  originalAmount: number | null;
  balance: number;
  monthlyPayment: number;
  insurance: number;
  extraMonthly: number;
  termMonths: number | null;
  startDate: string | null;
  progress: number;
  monthsRemaining: number;
  payoffDate: string | null;
  interestRemaining: number;
  paidPrincipal: number;
  paidInterest: number;
  schedule: ScheduleRow[];
  payments: DebtPayment[];
}

export async function getDebtDetail(
  id: string,
  indexRates?: Record<string, number>,
): Promise<DebtDetailVM | null> {
  const debt = await getDebt(id);
  if (!debt) return null;

  const [payments, currency, rates] = await Promise.all([
    listDebtPayments(id),
    getDisplayCurrency(),
    getFxRates(),
  ]);

  const conv = (n: number) => convertCurrency(n, debt.currency, currency, rates);
  const apr = effectiveApr(debt, indexRates);

  const input = {
    balance: conv(debt.balance),
    apr,
    termMonths: debt.termMonths,
    monthlyPayment: debt.currentPayment > 0 ? conv(debt.currentPayment) : null,
    insurance: debt.insurance != null ? conv(debt.insurance) : 0,
    extraMonthly: debt.extraMonthly != null ? conv(debt.extraMonthly) : 0,
    startDate: debt.startDate,
    originalAmount: debt.originalAmount != null ? conv(debt.originalAmount) : null,
  };

  const pmts: DebtPayment[] = payments.map((p) => ({
    ...p,
    amount: conv(p.amount),
    extraAmount: conv(p.extraAmount),
  }));

  const recompute =
    pmts.length > 0
      ? recomputeFromPayments(
          input,
          pmts.map((p) => ({ paymentDate: p.paymentDate, amount: p.amount, extraAmount: p.extraAmount })),
        )
      : null;

  const currentBalance = recompute ? recompute.currentBalance : input.balance;
  const schedule = buildSchedule({ ...input, balance: currentBalance });
  const interestRemaining = schedule.reduce((s, r) => s + r.interest, 0);
  const progress = recompute
    ? recompute.progressPct
    : input.originalAmount && input.originalAmount > 0
      ? Math.min(1, Math.max(0, (input.originalAmount - currentBalance) / input.originalAmount))
      : 0;

  return {
    id: debt.id,
    name: debt.name,
    debtType: debt.debtType ?? null,
    currency,
    rateType: debt.rateType ?? null,
    rateIndex: debt.rateIndex ?? null,
    rateSpread: debt.rateSpread ?? null,
    apr,
    originalAmount: input.originalAmount,
    balance: round2(currentBalance),
    monthlyPayment: round2(input.monthlyPayment ?? 0),
    insurance: round2(input.insurance),
    extraMonthly: round2(input.extraMonthly),
    termMonths: debt.termMonths ?? null,
    startDate: debt.startDate ?? null,
    progress,
    monthsRemaining: schedule.length,
    payoffDate: schedule[schedule.length - 1]?.date ?? null,
    interestRemaining: round2(interestRemaining),
    paidPrincipal: recompute ? recompute.paidPrincipal : 0,
    paidInterest: recompute ? recompute.paidInterest : 0,
    schedule,
    payments: pmts,
  };
}
