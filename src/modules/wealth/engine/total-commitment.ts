/**
 * Compromiso mensual TOTAL — el insumo del NÚMERO DE INDEPENDENCIA (capital que, al 8%, sostiene el
 * "estilo de vida actual" del usuario). Definición del usuario: TODO compromiso mensual recurrente,
 * SIN discriminar por esencial:
 *   · presupuesto de los sobres (budget_items de gasto)
 *   · aportes mensuales a metas de ahorro (savings_goals)
 *   · DCA / aportes a inversiones (investment_holdings.monthly_contribution)
 *   · cuotas de deuda + primas de seguro recurrentes
 *
 * Espeja computeEssentialMonthly pero SIN el filtro esencial (el service no filtra is_essential) y
 * SUMANDO el DCA. Mantiene las MISMAS dos reglas de deduplicación:
 *  #1 (derivadas vs entidades): al sumar sobres se cuentan SOLO los propios ('manual'/'recurring');
 *     las líneas derivadas (debt/goal/policy/…) se cuentan desde su entidad, no del budget.
 *  #2 (prima vía ahorro): si una meta financia una póliza (policy_id) → se cuenta el aporte de la
 *     meta y NO la prima (ya se paga vía ese ahorro). La prima excluida se reporta.
 * El DCA NO crea budget_item derivado (no hay source_kind de holding) → se suma aparte sin doble conteo.
 */
import { convertCurrency } from "@/lib/fx";
import type {
  EssentialBudgetLine,
  EssentialEntity,
  EssentialGoal,
  EssentialPolicy,
  EssentialExcludedPolicy,
} from "@/modules/wealth/engine/essential-expense";
import type { BudgetPeriod } from "@/lib/budget/budget-period";

export type CommitmentBreakdown = {
  /** Total mensual del compromiso, en moneda de visualización. */
  total: number;
  byOrigin: {
    sobres: number;
    goals: number;
    dca: number;
    debts: number;
    policies: number;
  };
  /** Primas excluidas por la regla #2 (financiadas vía un ahorro). */
  excludedPolicies: EssentialExcludedPolicy[];
  /** Mes del presupuesto con que se calcularon los sobres. `isFallback` = el mes en curso
   *  todavía no tiene presupuesto y se usó el último que sí lo tiene; la UI lo dice. Lo
   *  llena el service (el motor es puro y no sabe de periodos). */
  budgetPeriod?: BudgetPeriod | null;
};

/** Solo estas fuentes cuentan como "sobre real"; las derivadas van por su entidad (regla #1). */
const OWN_SOURCE = new Set(["manual", "recurring"]);

export function computeTotalCommitment(args: {
  displayCurrency: string;
  rates: Record<string, number>;
  budgetLines: EssentialBudgetLine[];
  goals: EssentialGoal[];
  dca: EssentialEntity[]; // aportes DCA por holding (monthly_contribution), ya mensuales
  debts: EssentialEntity[];
  policies: EssentialPolicy[];
}): CommitmentBreakdown {
  const { displayCurrency: cur, rates } = args;
  const conv = (amount: number, from: string): number =>
    from && cur && from !== cur ? convertCurrency(amount, from, cur, rates) : amount;

  // Sobres: SOLO manual/recurring (regla #1). Deudas/metas/pólizas derivadas se cuentan por su entidad.
  const sobres = args.budgetLines
    .filter((b) => OWN_SOURCE.has(b.sourceKind))
    .reduce((s, b) => s + conv(b.amount, b.currency), 0);

  const goals = args.goals.reduce((s, g) => s + conv(g.monthly, g.currency), 0);
  const dca = args.dca.reduce((s, d) => s + conv(d.monthly, d.currency), 0);
  const debts = args.debts.reduce((s, d) => s + conv(d.monthly, d.currency), 0);

  // Regla #2: prima financiada por una meta (policy_id) → se excluye (ya se paga vía el aporte).
  const financingGoalByPolicy = new Map<string, string>();
  for (const g of args.goals) {
    if (g.policyId && !financingGoalByPolicy.has(g.policyId)) {
      financingGoalByPolicy.set(g.policyId, g.name ?? "un ahorro");
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
    total: sobres + goals + dca + debts + policies,
    byOrigin: { sobres, goals, dca, debts, policies },
    excludedPolicies,
  };
}
