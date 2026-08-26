/**
 * PURE mappers: raw per-entity data → the advisor's context "levers". No `server-only`,
 * no Supabase, no clock — deterministic and unit-testable. The context-engine feeds these
 * with data it already fetches; buildSystemPrompt renders the result as NEUTRAL facts.
 *
 * These exist so the advisor can be CONCRETE per entity ("tu Tarjeta al 40% te cuesta
 * ₡26.700/mes") instead of only seeing an aggregate — every figure is REAL/derived, so
 * grounding stays intact (nothing here invites invention).
 */

/** One debt as a lever: live balance + APR + minimum + the monthly interest it costs. */
export type DebtLever = {
  name: string;
  liveBalance: number;
  apr: number | null;
  minPayment: number;
  currency: string;
  /** liveBalance × apr/100 / 12, rounded. 0 when apr is null/≤0 (no cost to attack). */
  monthlyInterestCost: number;
};

export type DebtLeverInput = {
  name: string;
  liveBalance: number;
  apr: number | null;
  minPayment: number;
  currency: string;
};

/**
 * Debts with a live balance, as levers ordered by monthly interest cost (what hurts most,
 * first — the "attack this one" signal), then by balance. Caps at `topN`; the overflow count
 * lets the prompt say "+N más". Debts at ≤0 (saldadas) are dropped: they are not a lever.
 */
export function debtLevers(
  debts: DebtLeverInput[],
  topN = 6,
): { debts: DebtLever[]; moreCount: number } {
  const mapped: DebtLever[] = debts
    .filter((d) => d.liveBalance > 0.5)
    .map((d) => ({
      name: d.name,
      liveBalance: Math.round(d.liveBalance),
      apr: d.apr,
      minPayment: Math.round(d.minPayment),
      currency: d.currency,
      monthlyInterestCost: d.apr && d.apr > 0 ? Math.round((d.liveBalance * d.apr) / 100 / 12) : 0,
    }))
    .sort((a, b) => b.monthlyInterestCost - a.monthlyInterestCost || b.liveBalance - a.liveBalance);
  return { debts: mapped.slice(0, topN), moreCount: Math.max(0, mapped.length - topN) };
}
