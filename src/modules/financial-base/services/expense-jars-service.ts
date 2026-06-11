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
import {
  buildExpenseJars,
  type Jar,
  type JarEntities,
  type JarEntity,
  type KeyedTotals,
} from "@/modules/financial-base/engine/expense-jars";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

export async function getExpenseJars(args: {
  tree: CategoryNode[];
  budgetByKey: KeyedTotals;
  realByKey: KeyedTotals;
  currency: string;
}): Promise<Jar[]> {
  const [detailed, rates] = await Promise.all([listLinkableEntitiesDetailed(), getFxRates()]);

  const conv = (amount: number, from: string): number =>
    convertCurrency(amount, from, args.currency, rates);
  const toJarEntity = (e: { id: string; name: string; sub: string; amount: number; currency: string; delta?: string }): JarEntity => ({
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
  });
}
