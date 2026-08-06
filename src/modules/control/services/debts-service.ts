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
  listDebtPaymentsByDebt,
} from "@/modules/control/services/control-service";
import { recomputeFromPayments } from "@/modules/control/engine/amortization";
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
  /**
   * Saldo ACTUAL, derivado de los pagos reportados igual que en el detalle. `debts.balance` es el
   * saldo con el que se dio de alta la deuda y solo se toca al editarla o al abonar en modo
   * 'cuota'; mostrarlo tal cual dejaba la lista congelada mientras el detalle bajaba a cada pago,
   * y la simulación de estrategia partía de un número viejo.
   */
  balance: number;
  /**
   * El mismo saldo derivado, en la moneda NATIVA de la deuda. La fila muestra los importes
   * nativos cuando la deuda no está en la moneda de display; sin esto, esa fila seguiría
   * mostrando el saldo guardado mientras los totales usan el derivado — la misma incoherencia,
   * movida de lugar. El form de edición NO usa esto: precarga el guardado (`raw`), porque
   * guardar el derivado y volver a aplicarle los pagos lo contaría dos veces.
   */
  nativeBalance: number;
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
  const [debts, base, currency, rates, paidThisMonthMap, paymentsByDebt] = await Promise.all([
    listDebts(),
    getBaseSummary(),
    getDisplayCurrency(),
    getFxRates(),
    listDebtPaymentDatesThisMonth(),
    listDebtPaymentsByDebt(),
  ]);

  const conv = (n: number, from: string) => convertCurrency(n, from, currency, rates);
  const now = new Date();

  const active = debts.filter((d) => d.isCurrent !== false);
  const vms: DebtVM[] = active.map((d) => {
    const due = computeDueStatus(
      { payDay: d.payDay, startDate: d.startDate, paymentDates: paidThisMonthMap[d.id] ?? [] },
      now,
    );
    const apr = effectiveApr(d, indexRates);
    // Saldo derivado con la MISMA función que usa el detalle, para que los dos números
    // coincidan por construcción y no por disciplina. Se corre en la moneda NATIVA de la
    // deuda — que es la de sus pagos — y después se convierte.
    const pmts = paymentsByDebt[d.id] ?? [];
    const saldoNativo =
      pmts.length > 0
        ? recomputeFromPayments(
            {
              balance: d.balance,
              apr,
              termMonths: d.termMonths,
              monthlyPayment: d.currentPayment > 0 ? d.currentPayment : null,
              insurance: d.insurance ?? 0,
              extraMonthly: d.extraMonthly ?? 0,
              startDate: d.startDate,
              originalAmount: d.originalAmount ?? null,
            },
            pmts,
          ).currentBalance
        : d.balance;
    return {
      id: d.id,
      name: d.name,
      debtType: d.debtType ?? null,
      bank: d.bank ?? null,
      currency,
      balance: conv(saldoNativo, d.currency),
      nativeBalance: saldoNativo,
      originalAmount: d.originalAmount != null ? conv(d.originalAmount, d.currency) : null,
      apr,
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
