/**
 * Normaliza el resumen de sobres a la moneda de visualización del asesor (puro, testeable). El motor
 * de sobres (getEnvelopesSummary) devuelve los presupuestos en la moneda de DISPLAY, que es también
 * en la que trabaja el AI (ctx.currency, desde #560); si `targetCurrency` difiere, acá se CONVIERTE
 * cada presupuesto (con rates), se reetiqueta, y se calcula el sobre de MAYOR gasto ya convertido.
 * Así el AI nunca ve "$X mostrado como ₡X" ni convierte a mano. Sin IO.
 *
 * A DIFERENCIA de las posiciones o las deudas, acá convertir es lo CORRECTO y deliberado: un sobre
 * no tiene moneda propia (el motor de presupuesto resuelve una sola moneda por período), y un sobre
 * partido por moneda dejaría de ser una olla contra la que se gasta. El prompt lo dice: los
 * presupuestos vienen convertidos.
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
