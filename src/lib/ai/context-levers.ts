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

/** One goal as a lever: target + deadline + actual pace vs the pace the deadline needs. */
export type GoalLever = {
  name: string;
  target: number;
  currency: string;
  targetDate?: string | null;
  monthlyActual: number;
  /** (target − current) / meses restantes. undefined si no hay fecha (no hay ritmo objetivo). */
  monthlyRequired?: number;
  /** monthlyActual ≥ monthlyRequired. undefined si no hay fecha. */
  onTrack?: boolean;
  /** La fecha objetivo ya pasó (o es este mes): monthlyRequired = todo el faltante. */
  vencida?: boolean;
};

export type GoalLeverInput = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  targetDate?: string | null;
  currency: string;
};

/** Meses ENTEROS de `fromISO` a `toISO` (parciales no cuentan). Opera sobre "YYYY-MM-DD" —
 *  NUNCA construye Date (timezone-safe; la fecha "hoy" viene de userToday en la tz del usuario).
 *  NaN si alguna fecha es inválida. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const parse = (s: string): [number, number, number] => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return [y ?? NaN, m ?? NaN, d ?? NaN];
  };
  const [fy, fm, fd] = parse(fromISO);
  const [ty, tm, td] = parse(toISO);
  if ([fy, fm, fd, ty, tm, td].some((n) => !Number.isFinite(n))) return NaN;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1; // el mes en curso no cuenta hasta cumplir el día
  return months;
}

/**
 * Goals WITH a target, as levers: each carries the pace the deadline requires vs the actual
 * contribution, so the advisor can say "vas a ₡X/mes pero necesitás ₡Y para llegar en la fecha".
 * Ordered by shortfall (most behind first). `todayISO` is injected (userToday) → deterministic.
 */
export function goalLevers(
  goals: GoalLeverInput[],
  todayISO: string,
  topN = 6,
): { goals: GoalLever[]; moreCount: number } {
  const mapped: GoalLever[] = goals
    .filter((g) => g.targetAmount > 0)
    .map((g) => {
      const gap = Math.max(0, g.targetAmount - g.currentAmount);
      let monthlyRequired: number | undefined;
      let onTrack: boolean | undefined;
      let vencida: boolean | undefined;
      if (g.targetDate) {
        const months = monthsBetween(todayISO, g.targetDate);
        if (Number.isFinite(months)) {
          if (months <= 0) {
            vencida = true;
            monthlyRequired = gap; // vencida: hace falta todo el faltante ya
            onTrack = gap <= 0;
          } else {
            monthlyRequired = Math.ceil(gap / months);
            onTrack = g.monthlyContribution >= monthlyRequired;
          }
        }
      }
      return {
        name: g.name,
        target: Math.round(g.targetAmount),
        currency: g.currency,
        targetDate: g.targetDate ?? null,
        monthlyActual: Math.round(g.monthlyContribution),
        monthlyRequired: monthlyRequired === undefined ? undefined : Math.round(monthlyRequired),
        onTrack,
        vencida,
      };
    });
  const shortfall = (g: GoalLever): number => (g.monthlyRequired ?? 0) - g.monthlyActual;
  mapped.sort((a, b) => shortfall(b) - shortfall(a));
  return { goals: mapped.slice(0, topN), moreCount: Math.max(0, mapped.length - topN) };
}

/** One protection gap as a lever: what's uncovered + how severe + why it matters. */
export type ProtectionGapLever = {
  type: string;
  severity: "alto" | "medio" | "bajo";
  description: string;
};

/**
 * Protection gaps from computeProtection, narrowed to the advisor's factual context: type +
 * severity + description. Drops `recommendation` (UI sales copy, not the advisor's to echo).
 */
export function protectionLevers(
  gaps: { type: string; severity: "alto" | "medio" | "bajo"; description: string }[],
): ProtectionGapLever[] {
  return gaps.map((g) => ({ type: g.type, severity: g.severity, description: g.description }));
}
