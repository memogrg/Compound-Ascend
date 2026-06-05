import "server-only";

/**
 * Overview de deudas para la sub-página /control-financiero/deudas.
 * Normaliza todos los montos a la moneda principal (para totales y estrategia)
 * y entrega datos serializables; el motor de amortización/estrategia (puro)
 * se ejecuta en el cliente para el control reactivo del pago extra.
 */
import { listDebts } from "@/modules/control/services/control-service";
import { getBaseSummary } from "@/modules/financial-base";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { effectiveApr, buildRateNote } from "@/modules/control/services/index-rates";
import type { DebtRateType, DebtRateIndex } from "@/modules/control/types";

export interface DebtVM {
  id: string;
  name: string;
  debtType: string | null;
  /** Moneda principal (montos ya normalizados). */
  currency: string;
  balance: number;
  originalAmount: number | null;
  /** TAE efectiva (índice + spread en variables; F5). */
  apr: number;
  rateType: DebtRateType | null;
  rateIndex: DebtRateIndex | null;
  rateSpread: number | null;
  minPayment: number;
  monthlyPayment: number;
  insurance: number;
  extraMonthly: number;
  termMonths: number | null;
  startDate: string | null;
  /** Nota cuando el índice movió la TAE (deudas variables). */
  rateNote: string | null;
}

export interface DebtsOverview {
  currency: string;
  incomeMonthly: number;
  debts: DebtVM[];
}

export async function getDebtsOverview(
  indexRates?: Record<string, number>,
): Promise<DebtsOverview> {
  const [debts, base, currency, rates] = await Promise.all([
    listDebts(),
    getBaseSummary(),
    getDisplayCurrency(),
    getFxRates(),
  ]);

  const conv = (n: number, from: string) => convertCurrency(n, from, currency, rates);

  const vms: DebtVM[] = debts
    .filter((d) => d.isCurrent !== false)
    .map((d) => ({
      id: d.id,
      name: d.name,
      debtType: d.debtType ?? null,
      currency,
      balance: conv(d.balance, d.currency),
      originalAmount: d.originalAmount != null ? conv(d.originalAmount, d.currency) : null,
      apr: effectiveApr(d, indexRates),
      rateType: d.rateType ?? null,
      rateIndex: d.rateIndex ?? null,
      rateSpread: d.rateSpread ?? null,
      minPayment: conv(d.minPayment, d.currency),
      monthlyPayment: conv(d.currentPayment, d.currency),
      insurance: d.insurance != null ? conv(d.insurance, d.currency) : 0,
      extraMonthly: d.extraMonthly != null ? conv(d.extraMonthly, d.currency) : 0,
      termMonths: d.termMonths ?? null,
      startDate: d.startDate ?? null,
      rateNote: buildRateNote(d, indexRates),
    }));

  return {
    currency,
    incomeMonthly: base.indicators.incomeMonthly,
    debts: vms,
  };
}
