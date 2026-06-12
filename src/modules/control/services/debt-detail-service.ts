import "server-only";

/**
 * View-model del detalle de una deuda: saldo recalculado desde los pagos
 * reportados (fuente de la verdad), tabla de amortización completa y pagos.
 * Montos normalizados a la moneda principal; el motor (puro) corre tanto aquí
 * como en el cliente para la calculadora de escenarios.
 */
import { getDebt, listDebtPayments } from "@/modules/control/services/control-service";
import { getDisplayCurrency } from "@/modules/financial-base";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { buildSchedule, recomputeFromPayments } from "@/modules/control/engine/amortization";
import { effectiveApr, buildRateNote } from "@/modules/control/services/index-rates";
import { computeDueStatus } from "@/modules/control/engine/due-dates";
import type { ScheduleRow } from "@/modules/control/engine/amortization";
import type { DebtPayment, DebtRateType, DebtRateIndex } from "@/modules/control/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DebtDetailVM {
  id: string;
  name: string;
  debtType: string | null;
  bank: string | null;
  currency: string;
  rateType: DebtRateType | null;
  rateIndex: DebtRateIndex | null;
  rateSpread: number | null;
  introApr: number | null;
  introFixedMonths: number | null;
  apr: number;
  originalAmount: number | null;
  balance: number;
  monthlyPayment: number;
  insurance: number;
  extraMonthly: number;
  termMonths: number | null;
  startDate: string | null;
  rateNote: string | null;
  progress: number;
  monthsRemaining: number;
  payoffDate: string | null;
  interestRemaining: number;
  paidPrincipal: number;
  paidInterest: number;
  nextDue: string | null;
  dueSoon: boolean;
  paidThisMonth: boolean;
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
    introApr: debt.introApr ?? null,
    introFixedMonths: debt.introFixedMonths ?? null,
  };

  const due = computeDueStatus(
    {
      payDay: debt.payDay,
      startDate: debt.startDate,
      paymentDates: payments.map((p) => p.paymentDate),
    },
    new Date(),
  );

  const pmts: DebtPayment[] = payments.map((p) => ({
    ...p,
    amount: conv(p.amount),
    extraAmount: conv(p.extraAmount),
    principal: p.principal == null ? null : conv(p.principal),
    interest: p.interest == null ? null : conv(p.interest),
  }));

  const recompute =
    pmts.length > 0
      ? recomputeFromPayments(
          input,
          pmts.map((p) => ({
            paymentDate: p.paymentDate,
            amount: p.amount,
            extraAmount: p.extraAmount,
          })),
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
    bank: debt.bank ?? null,
    currency,
    rateType: debt.rateType ?? null,
    rateIndex: debt.rateIndex ?? null,
    rateSpread: debt.rateSpread ?? null,
    introApr: debt.introApr ?? null,
    introFixedMonths: debt.introFixedMonths ?? null,
    apr,
    originalAmount: input.originalAmount,
    balance: round2(currentBalance),
    monthlyPayment: round2(input.monthlyPayment ?? 0),
    insurance: round2(input.insurance),
    extraMonthly: round2(input.extraMonthly),
    termMonths: debt.termMonths ?? null,
    startDate: debt.startDate ?? null,
    rateNote: buildRateNote(debt, indexRates),
    progress,
    monthsRemaining: schedule.length,
    payoffDate: schedule[schedule.length - 1]?.date ?? null,
    interestRemaining: round2(interestRemaining),
    paidPrincipal: recompute ? recompute.paidPrincipal : 0,
    paidInterest: recompute ? recompute.paidInterest : 0,
    nextDue: due.nextDue,
    dueSoon: due.dueSoon,
    paidThisMonth: due.paidThisMonth,
    schedule,
    payments: pmts,
  };
}
