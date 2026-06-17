import "server-only";

/**
 * Overview de deudas para la sub-página /control-financiero/deudas.
 * Normaliza todos los montos a la moneda principal (para totales y estrategia)
 * y entrega datos serializables; el motor de amortización/estrategia (puro)
 * se ejecuta en el cliente para el control reactivo del pago extra.
 */
import {
  listDebts,
  listDebtPaymentDatesThisMonth,
} from "@/modules/control/services/control-service";
import { getBaseSummary } from "@/modules/financial-base";
import { getDisplayCurrency } from "@/modules/financial-base";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { effectiveApr, buildRateNote } from "@/modules/control/services/index-rates";
import { computeDueStatus } from "@/modules/control/engine/due-dates";
import type { Debt, DebtRateType, DebtRateIndex } from "@/modules/control/types";

export interface DebtVM {
  id: string;
  name: string;
  debtType: string | null;
  bank: string | null;
  /** Moneda principal (montos ya normalizados). */
  currency: string;
  balance: number;
  originalAmount: number | null;
  /** TAE efectiva (índice + spread en variables; F5). */
  apr: number;
  rateType: DebtRateType | null;
  rateIndex: DebtRateIndex | null;
  rateSpread: number | null;
  /** Tasa introductoria (caso CR: N meses fija → variable). */
  introApr: number | null;
  introFixedMonths: number | null;
  minPayment: number;
  monthlyPayment: number;
  insurance: number;
  extraMonthly: number;
  termMonths: number | null;
  startDate: string | null;
  /** Nota cuando el índice movió la TAE (deudas variables). */
  rateNote: string | null;
  /** Próximo vencimiento estimado y aviso (≤2 días, sin pago del mes). */
  nextDue: string | null;
  dueSoon: boolean;
  paidThisMonth: boolean;
}

export interface DebtsOverview {
  currency: string;
  incomeMonthly: number;
  /** Sobrante mensual (free cashflow) — extra por defecto de la estrategia. */
  freeCashflow: number;
  /** Valores actuales de los índices (prime/tbp/tri) para el form. */
  indexRates: Record<string, number>;
  debts: DebtVM[];
  /** Deudas crudas (sin conversión) para precargar el form de edición. */
  raw: Debt[];
}

export async function getDebtsOverview(
  indexRates: Record<string, number> = {},
): Promise<DebtsOverview> {
  const [debts, base, currency, rates, paidThisMonthMap] = await Promise.all([
    listDebts(),
    getBaseSummary(),
    getDisplayCurrency(),
    getFxRates(),
    listDebtPaymentDatesThisMonth(),
  ]);

  const conv = (n: number, from: string) => convertCurrency(n, from, currency, rates);
  const now = new Date();

  const active = debts.filter((d) => d.isCurrent !== false);
  const vms: DebtVM[] = active.map((d) => {
      const due = computeDueStatus(
        { payDay: d.payDay, startDate: d.startDate, paymentDates: paidThisMonthMap[d.id] ?? [] },
        now,
      );
      return {
        id: d.id,
        name: d.name,
        debtType: d.debtType ?? null,
        bank: d.bank ?? null,
        currency,
        balance: conv(d.balance, d.currency),
        originalAmount: d.originalAmount != null ? conv(d.originalAmount, d.currency) : null,
        apr: effectiveApr(d, indexRates),
        rateType: d.rateType ?? null,
        rateIndex: d.rateIndex ?? null,
        rateSpread: d.rateSpread ?? null,
        introApr: d.introApr ?? null,
        introFixedMonths: d.introFixedMonths ?? null,
        minPayment: conv(d.minPayment, d.currency),
        monthlyPayment: conv(d.currentPayment, d.currency),
        insurance: d.insurance != null ? conv(d.insurance, d.currency) : 0,
        extraMonthly: d.extraMonthly != null ? conv(d.extraMonthly, d.currency) : 0,
        termMonths: d.termMonths ?? null,
        startDate: d.startDate ?? null,
        rateNote: buildRateNote(d, indexRates),
        nextDue: due.nextDue,
        dueSoon: due.dueSoon,
        paidThisMonth: due.paidThisMonth,
      };
    });

  return {
    currency,
    incomeMonthly: base.indicators.incomeMonthly,
    freeCashflow: base.indicators.freeCashflow,
    indexRates,
    debts: vms,
    raw: active,
  };
}
