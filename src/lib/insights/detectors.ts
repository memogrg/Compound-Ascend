/**
 * Detectores conductuales (puros, sin IO). Reciben datos ya cargados y devuelven
 * DetectedInsight[]. Copy en 2ª persona, neutral y sin juicio (antipatrones de la
 * Biblia conductual). El estado/persistencia vive en insights-service.
 */
import type { SavingsGoal, Debt } from "@/modules/control/types";
import type { DetectedInsight } from "@/lib/insights/types";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";

/** Meses enteros desde `now` hasta una fecha ISO (puede ser negativo si pasó). */
function monthsUntil(dateIso: string, now: Date): number {
  const t = new Date(dateIso);
  return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
}

const isFuture = (dateIso: string, now: Date): boolean =>
  new Date(dateIso).getTime() > now.getTime();

/** Metas que perdieron ritmo: atrasadas o cuyo aporte no alcanza para su fecha. */
export function detectStalledGoals(goals: SavingsGoal[], now: Date = new Date()): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const g of goals) {
    let requiredMonthly = 0;
    let qualifies = g.status === "atrasado";
    if (
      g.targetDate &&
      isFuture(g.targetDate, now) &&
      g.currentAmount < g.targetAmount
    ) {
      const months = Math.max(monthsUntil(g.targetDate, now), 1);
      requiredMonthly = (g.targetAmount - g.currentAmount) / months;
      if (requiredMonthly > g.monthlyContribution) qualifies = true;
    }
    if (!qualifies) continue;
    out.push({
      kind: "meta_estancada",
      severity: "observar",
      relatedKind: "goal",
      relatedId: g.id,
      metric: Math.round(requiredMonthly),
      title: `Tu meta "${g.name}" está perdiendo ritmo`,
      body: "No avanza al paso necesario para su fecha objetivo. Un pequeño ajuste en tu aporte la vuelve a poner en camino.",
    });
  }
  return out;
}

/** Deudas con atraso: requieren atención para que no crezcan por intereses. */
export function detectGrowingDebt(debts: Debt[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const d of debts) {
    if (d.delinquency === "1_30" || d.delinquency === "31_60" || d.delinquency === "60_mas") {
      out.push({
        kind: "deuda_creciendo",
        severity: "accionar",
        relatedKind: "debt",
        relatedId: d.id,
        metric: d.balance,
        title: `Tu deuda "${d.name}" necesita atención`,
        body: "Aparece con atraso. Priorizarla ahora evita que siga creciendo por intereses.",
      });
    }
  }
  return out;
}

/** Metas con avance fuerte (>= 80%): celebración y empujón final. */
export function detectPositiveStreak(goals: SavingsGoal[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const g of goals) {
    if (g.targetAmount <= 0) continue;
    const pct = g.currentAmount / g.targetAmount;
    if (pct < 0.8) continue;
    const pctInt = Math.round(pct * 100);
    out.push({
      kind: "racha_positiva",
      severity: "celebrar",
      relatedKind: "goal",
      relatedId: g.id,
      metric: pctInt,
      title: pct >= 1 ? `¡Lograste tu meta "${g.name}"!` : `¡Estás muy cerca de "${g.name}"!`,
      body:
        pct >= 1
          ? "La cerraste. Buen momento para definir tu próximo objetivo."
          : `Ya alcanzaste el ${pctInt}% de tu meta. Un último empujón y la cierras.`,
    });
  }
  return out;
}

/**
 * Frasco de jugar: el gasto de disfrute del mes va muy por encima del promedio
 * reciente (> +30%). Observación amable, no prohibición.
 */
export function detectDisfruteSpike(p: {
  current: number;
  priorAvg: number;
  categoryId?: string;
}): DetectedInsight[] {
  if (!(p.priorAvg > 0 && p.current > p.priorAvg * 1.3)) return [];
  return [
    {
      kind: "gasto_disfrute_alza",
      severity: "observar",
      relatedKind: "category",
      relatedId: p.categoryId,
      metric: Math.round(p.current),
      title: "Tu frasco de jugar subió este mes",
      body: "Tu gasto de disfrute va por encima de tu promedio reciente. No se trata de eliminarlo: define un monto libre para disfrutar sin culpa y proteger tus metas.",
    },
  ];
}

/** Corre los tres detectores snapshot sobre los datos de control. */
export function runDetectors(
  { goals, debts }: { goals: SavingsGoal[]; debts: Debt[] },
  now: Date = new Date(),
): DetectedInsight[] {
  return [
    ...detectStalledGoals(goals, now),
    ...detectGrowingDebt(debts),
    ...detectPositiveStreak(goals),
  ];
}

/**
 * Aportes del mes sin confirmar → un insight 'accionar' por holding. relatedId =
 * holdingId para que syncInsights lo resuelva al confirmar el precio.
 */
export function detectOpenContributions(contributions: OpenContribution[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const c of contributions) {
    out.push({
      kind: "aporte_pendiente",
      severity: "accionar",
      title: `Confirmá el precio de tu aporte a ${c.label}`,
      body: "Registramos tu aporte del mes al precio en vivo. Confirmá o ajustá el precio de compra en el Portafolio para promediar bien tu costo.",
      relatedKind: "holding",
      relatedId: c.holdingId,
    });
  }
  return out;
}
