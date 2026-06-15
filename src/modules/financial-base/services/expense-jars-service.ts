import "server-only";

/**
 * Arma el modelo de frascos del tab de Gastos. Reutiliza lo que el loader
 * (base-view) ya tiene (tree + budget/real keyed) y solo fetchea las entidades
 * vinculables con monto; convierte cada monto a la moneda de visualización y
 * delega el armado a la función pura buildExpenseJars (engine, testeable).
 */
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { formatMoney } from "@/lib/format";
import { listLinkableEntitiesDetailed } from "@/modules/financial-base/services/linkable-entities-service";
import { getBudgetTotals, getLinkedBudgetBySource } from "@/modules/financial-base/services/budget-service";
import { getRealTotals, getLinkedSpentByEntity } from "@/modules/financial-base/services/transaction-service";
import { getSystemCategoryId } from "@/modules/financial-base/services/linked-transaction-service";
import {
  buildExpenseJars,
  type Jar,
  type JarEntities,
  type JarEntity,
  type KeyedTotals,
  type LinkedBudgetConfig,
} from "@/modules/financial-base/engine/expense-jars";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { Period } from "@/modules/financial-base/types";

export async function getExpenseJars(args: {
  tree: CategoryNode[];
  budgetByKey: KeyedTotals;
  realByKey: KeyedTotals;
  currency: string;
  /** Activa frascos vinculados budget-aware (esta entrega: solo `debt`). */
  linkedBudget?: LinkedBudgetConfig;
}): Promise<Jar[]> {
  const [detailed, rates] = await Promise.all([listLinkableEntitiesDetailed(), getFxRates()]);

  const conv = (amount: number, from: string): number =>
    convertCurrency(amount, from, args.currency, rates);
  const toJarEntity = (e: {
    id: string;
    name: string;
    sub: string;
    amount: number;
    currency: string;
    delta?: string;
  }): JarEntity => ({
    id: e.id,
    name: e.name,
    sub: e.sub,
    amount: conv(e.amount, e.currency),
    delta: e.delta,
  });

  const entities: JarEntities = {
    holding: detailed.holding.map(toJarEntity),
    rental: detailed.rental.map(toJarEntity),
    debt: detailed.debt.map(toJarEntity),
    policy: detailed.policy.map(toJarEntity),
    goal: detailed.goal.map(toJarEntity),
  };

  return buildExpenseJars({
    tree: args.tree,
    budgetByKey: args.budgetByKey,
    realByKey: args.realByKey,
    entities,
    fmt: (n: number) => formatMoney(n, args.currency),
    linkedBudget: args.linkedBudget,
  });
}

/**
 * Frascos scopeados a una fecha de corte (filtro propio del tab de Gastos): el
 * presupuesto es el del mes de `period`, y el gasto real se acumula SOLO hasta
 * el día `asOf` (inclusive). Reutiliza getRealTotals con un periodo cuyo `to`
 * se recorta a `asOf`, así la semántica es idéntica a la del mes completo
 * cuando `asOf` es el último día. No re-scopea cards ni gráficas.
 */
export async function getExpenseJarsAsOf(args: {
  tree: CategoryNode[];
  period: Period;
  asOf: string; // YYYY-MM-DD (dentro del mes de `period`)
  currency: string;
}): Promise<Jar[]> {
  const cutoff: Period = { ...args.period, to: args.asOf };
  const [budget, real, debtBudget, debtSpent, deudasCatId] = await Promise.all([
    getBudgetTotals(args.period),
    getRealTotals(cutoff),
    // Deudas budget-aware: cuota derivada por deuda (mes) + pagado al corte +
    // categoría de sistema del pago (para Registrar gasto). Solo `debt` en esta
    // entrega; el engine queda listo para Libertad/Defensa/Ahorro.
    getLinkedBudgetBySource(args.period, "debt"),
    getLinkedSpentByEntity(cutoff, "debt"),
    getSystemCategoryId("deudas"),
  ]);
  return getExpenseJars({
    tree: args.tree,
    budgetByKey: budget.expenseByKey,
    realByKey: real.expenseByKey,
    currency: args.currency,
    linkedBudget: {
      debt: { bySource: debtBudget, spentById: debtSpent, paymentCategoryId: deudasCatId },
    },
  });
}
