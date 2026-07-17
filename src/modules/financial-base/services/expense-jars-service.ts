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
import {
  getRealTotals,
  getLinkedSpentByEntity,
  getExtraordinarySpentByDebt,
} from "@/modules/financial-base/services/transaction-service";
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
  /** Presupuesto por sobre en su moneda nativa (S1: llega al engine, aún sin render). */
  nativeBudgetByKey?: Record<string, { value: number; currency: string }>;
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
    categoryId?: string | null;
  }): JarEntity => ({
    id: e.id,
    name: e.name,
    sub: e.sub,
    amount: conv(e.amount, e.currency),
    delta: e.delta,
    categoryId: e.categoryId ?? null,
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
    currency: args.currency,
    nativeBudgetByKey: args.nativeBudgetByKey ?? {},
    rates,
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
  const [budget, real, debtBudget, debtSpent, debtExtra, deudasCatId, goalBudget, goalSpent,
    holdingSpent, policyBudget, policySpent] =
    await Promise.all([
      getBudgetTotals(args.period),
      getRealTotals(cutoff),
      // Deudas budget-aware: cuota derivada por deuda (mes) + pagado al corte +
      // pagado extraordinario (subconjunto) + categoría de sistema del pago.
      getLinkedBudgetBySource(args.period, "debt"),
      getLinkedSpentByEntity(cutoff, "debt"),
      getExtraordinarySpentByDebt(cutoff),
      getSystemCategoryId("deudas"),
      // Ahorro budget-aware: aporte derivado por meta (mes) + aportado al corte.
      getLinkedBudgetBySource(args.period, "goal"),
      getLinkedSpentByEntity(cutoff, "goal"),
      // Libertad (holding): sin budget_items → el engine cae al aporte mensual
      // (e.amount); aportado = transacciones vinculadas del corte.
      getLinkedSpentByEntity(cutoff, "holding"),
      // Defensa (policy): prima derivada por póliza (mes) + pagado al corte.
      getLinkedBudgetBySource(args.period, "policy"),
      getLinkedSpentByEntity(cutoff, "policy"),
    ]);

  // La línea derivada de metas nace con categoryId NULL, pero Registrar gasto
  // exige un uuid. Imputamos el aporte a la categoría del GRUPO correspondiente
  // (key del tree) — uuid válido y existente; el vínculo real lo lleva
  // linked_kind/linked_id. Holding no tiene budget_items: cae al aporte mensual.
  const ahorroCatId = args.tree.find((g) => g.key === "g_ahorro_lp")?.id ?? null;
  const libertadCatId = args.tree.find((g) => g.key === "g_libertad")?.id ?? null;
  const defensaCatId = args.tree.find((g) => g.key === "g_defensa")?.id ?? null;

  return getExpenseJars({
    tree: args.tree,
    budgetByKey: budget.expenseByKey,
    realByKey: real.expenseByKey,
    nativeBudgetByKey: budget.nativeByKey,
    currency: args.currency,
    linkedBudget: {
      debt: {
        bySource: debtBudget,
        spentById: debtSpent,
        extraordinaryById: debtExtra,
        paymentCategoryId: deudasCatId,
      },
      goal: { bySource: goalBudget, spentById: goalSpent, paymentCategoryId: ahorroCatId },
      holding: {
        bySource: {}, // sin budget_items: cae a e.amount (el aporte) en el engine
        spentById: holdingSpent,
        paymentCategoryId: libertadCatId,
      },
      policy: {
        bySource: policyBudget,
        spentById: policySpent,
        paymentCategoryId: defensaCatId,
      },
    },
  });
}
