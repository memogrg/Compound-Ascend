/**
 * Selector de metas más REZAGADAS (piloto Inicio · Delta 1) — motor puro.
 *
 * La ficha de Ahorros pide un pie/lista de "metas más rezagadas". Se deriva de las
 * metas (savings_goals con targetAmount > 0) ordenando por progreso ascendente.
 * Sobres sin meta (targetAmount = 0) se excluyen: no tienen "rezago" que medir.
 */

export type GoalLagInput = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
};

export type GoalLag = {
  id: string;
  name: string;
  /** current / target, 0-1. */
  progress: number;
  /** Cuánto falta para la meta (≥ 0). */
  remaining: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Metas ordenadas de más a menos rezagada (menor progreso primero). */
export function rankSavingsGoalsByLag(goals: GoalLagInput[], limit = 3): GoalLag[] {
  return goals
    .filter((g) => g.targetAmount > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      progress: Math.min(1, Math.max(0, round2(g.currentAmount / g.targetAmount))),
      remaining: Math.max(0, round2(g.targetAmount - g.currentAmount)),
    }))
    .sort((a, b) => a.progress - b.progress)
    .slice(0, limit);
}
