/**
 * Gasto esencial mensual — el insumo del NÚMERO DE SEGURIDAD (capital que, al 8%,
 * cubre lo indispensable). Puro y testeable: recibe montos mensuales nativos +
 * tasas y devuelve el total en moneda de visualización con su desglose.
 *
 * ⚠️ Existe OTRA señal de "esencial" en el repo: `expense_items.nature='esencial'`
 * (tab Mi Base), que alimenta el KPI `essentialsWeight` (% del ingreso en gastos
 * esenciales). Responde OTRA pregunta (un porcentaje, no un capital) y sale de una
 * superficie de gasto DISTINTA (expense_items, no los sobres). NO es un duplicado
 * a limpiar. La reconciliación de las dos superficies de gasto es un follow-up de
 * producto aparte (ver el PR de este flag).
 *
 * Dos reglas de deduplicación OBLIGATORIAS:
 *  #1 (derivadas vs entidades): derived-budget-service crea budget_items para
 *     deudas/metas/pólizas (source_kind 'debt'/'goal'/'policy'). Al sumar los
 *     sobres se cuentan SOLO 'manual'/'recurring'; las entidades se cuentan desde
 *     sí mismas. Si no, todo lo vinculado sumaría dos veces.
 *  #2 (prima vía ahorro): si una meta esencial tiene policy_id → una póliza que
 *     también es esencial, se cuenta el APORTE de la meta y NO la prima (ya se
 *     paga vía ese ahorro). La prima excluida se reporta para que se entienda.
 */
import { convertCurrency } from "@/lib/fx";

/** Línea de presupuesto de un sobre esencial (con su origen, para la regla #1). */
export type EssentialBudgetLine = {
  amount: number; // mensual, en su moneda nativa
  currency: string;
  sourceKind: string; // 'manual' | 'recurring' | 'debt' | 'goal' | 'policy' | ...
};

export type EssentialEntity = { monthly: number; currency: string };
export type EssentialGoal = EssentialEntity & { policyId?: string | null; name?: string };
export type EssentialPolicy = EssentialEntity & { id: string; name?: string };

/** Prima excluida por la regla #2, con nombres para explicar el motivo en la UI. */
export type EssentialExcludedPolicy = {
  id: string;
  monthly: number; // en moneda de visualización
  policyName: string; // etiqueta de la póliza (X)
  viaGoalName: string; // el ahorro esencial que la financia (Y)
};

export type EssentialBreakdown = {
  /** Total mensual esencial, en moneda de visualización. */
  total: number;
  byOrigin: {
    sobres: number;
    debts: number;
    goals: number;
    policies: number;
  };
  /** Primas excluidas por la regla #2 (para mostrarlas tachadas con su motivo). */
  excludedPolicies: EssentialExcludedPolicy[];
};

/** Solo estas fuentes cuentan como "sobre real"; las derivadas van por su entidad. */
const OWN_SOURCE = new Set(["manual", "recurring"]);

export function computeEssentialMonthly(args: {
  displayCurrency: string;
  rates: Record<string, number>;
  budgetLines: EssentialBudgetLine[];
  debts: EssentialEntity[];
  goals: EssentialGoal[];
  policies: EssentialPolicy[];
}): EssentialBreakdown {
  const { displayCurrency: cur, rates } = args;
  const conv = (amount: number, from: string): number =>
    from && cur && from !== cur ? convertCurrency(amount, from, cur, rates) : amount;

  // Sobres: SOLO manual/recurring (regla #1). Las líneas derivadas
  // (debt/goal/policy) se cuentan desde su entidad, no acá.
  const sobres = args.budgetLines
    .filter((b) => OWN_SOURCE.has(b.sourceKind))
    .reduce((s, b) => s + conv(b.amount, b.currency), 0);

  const debts = args.debts.reduce((s, d) => s + conv(d.monthly, d.currency), 0);
  const goals = args.goals.reduce((s, g) => s + conv(g.monthly, g.currency), 0);

  // Regla #2: si una meta esencial financia una póliza esencial (policy_id),
  // su prima ya se paga vía el aporte → se excluye del cómputo de primas. Guardamos
  // qué ahorro la financia (nombre) para poder explicar la exclusión en la UI.
  const financingGoalByPolicy = new Map<string, string>();
  for (const g of args.goals) {
    if (g.policyId && !financingGoalByPolicy.has(g.policyId)) {
      financingGoalByPolicy.set(g.policyId, g.name ?? "un ahorro esencial");
    }
  }
  const excludedPolicies: EssentialExcludedPolicy[] = [];
  let policies = 0;
  for (const p of args.policies) {
    const viaGoalName = financingGoalByPolicy.get(p.id);
    if (viaGoalName !== undefined) {
      excludedPolicies.push({
        id: p.id,
        monthly: conv(p.monthly, p.currency),
        policyName: p.name ?? "una póliza",
        viaGoalName,
      });
      continue;
    }
    policies += conv(p.monthly, p.currency);
  }

  return {
    total: sobres + debts + goals + policies,
    byOrigin: { sobres, debts, goals, policies },
    excludedPolicies,
  };
}
