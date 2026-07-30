/**
 * Normaliza el resumen de sobres a la moneda de visualización del asesor (puro, testeable). El motor
 * de sobres (getEnvelopesSummary) devuelve los presupuestos en la moneda de DISPLAY; el AI trabaja en
 * la PRINCIPAL. Acá se CONVIERTE cada presupuesto a `targetCurrency` (con rates) y se reetiqueta, y se
 * calcula el sobre de MAYOR gasto ya convertido. Así el AI nunca ve "$X mostrado como ₡X" ni convierte
 * a mano. Sin IO.
 */
import { convertCurrency } from "@/lib/fx";

export type EnvelopeItem = { name: string; budget: number };
export type ExpenseGroup = { frasco: string; envelopes: EnvelopeItem[] };
export type EnvelopesSummaryLike = {
  currency: string;
  expense: ExpenseGroup[];
  goals: { frasco: string; names: string[] }[];
};

export type NormalizedEnvelopes = {
  envelopes: EnvelopesSummaryLike; // presupuestos YA en targetCurrency
  topGastoSobre: { name: string; monthly: number } | null; // sobre de mayor presupuesto, convertido
};

export function normalizeEnvelopes(
  summary: EnvelopesSummaryLike,
  targetCurrency: string,
  rates: Record<string, number>,
): NormalizedEnvelopes {
  const conv = (n: number): number =>
    summary.currency && summary.currency !== targetCurrency
      ? Math.round(convertCurrency(n, summary.currency, targetCurrency, rates))
      : Math.round(n);

  const expense: ExpenseGroup[] = summary.expense.map((g) => ({
    frasco: g.frasco,
    envelopes: g.envelopes.map((e) => ({ name: e.name, budget: conv(e.budget) })),
  }));

  let topGastoSobre: { name: string; monthly: number } | null = null;
  for (const g of expense) {
    for (const e of g.envelopes) {
      if (e.budget > 0 && (!topGastoSobre || e.budget > topGastoSobre.monthly)) {
        topGastoSobre = { name: e.name, monthly: e.budget };
      }
    }
  }

  return { envelopes: { currency: targetCurrency, expense, goals: summary.goals }, topGastoSobre };
}
