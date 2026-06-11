/**
 * Reconciliación (Fase 6 · interconexión) — puro y testeable.
 *
 * 1) "Sin vincular": transacciones del periodo cuya categoría sugiere una
 *    entidad (linked_kind de la categoría) pero que nacieron sin vínculo —
 *    candidatas a conciliar con 1 tap.
 * 2) "Plan vs real por entidad": cada línea derivada del presupuesto
 *    (deuda/meta/póliza/recurrente) comparada contra lo realmente
 *    transaccionado vinculado a esa entidad en el periodo.
 */
import type { Transaction, BudgetItem, LinkedKind } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

export type UnlinkedCandidate = {
  transaction: Transaction;
  suggestedKind: Exclude<LinkedKind, "none">;
};

/**
 * Transacciones sin vínculo cuya categoría sugiere entidad. Solo cuando el
 * usuario TIENE entidades de ese tipo (si no hay deudas, no hay nada que
 * conciliar). Ajustes y transferencias quedan fuera.
 */
export function findUnlinkedCandidates(
  transactions: Transaction[],
  categories: Category[],
  linkables: LinkableEntities,
): UnlinkedCandidate[] {
  const catLink = new Map<string, string>();
  for (const c of categories) {
    if (c.linkedKind) catLink.set(c.id, c.linkedKind);
  }
  const out: UnlinkedCandidate[] = [];
  for (const t of transactions) {
    if ((t.linkedKind ?? "none") !== "none") continue;
    if (t.kind !== "gasto" && t.kind !== "ingreso") continue;
    if (!t.categoryId) continue;
    const kind = catLink.get(t.categoryId) as Exclude<LinkedKind, "none"> | undefined;
    if (!kind) continue;
    if ((linkables[kind] ?? []).length === 0) continue;
    out.push({ transaction: t, suggestedKind: kind });
  }
  return out;
}

export type EntityAlertStatus = "sin_movimiento" | "parcial" | "cumplido" | "excedido";

export type EntityAlert = {
  sourceKind: string; // 'debt' | 'goal' | 'policy' | 'recurring' | 'dividend'
  sourceId: string;
  name: string; // nombre de la línea derivada ("Pago — Tarjeta BAC")
  planned: number;
  real: number;
  currency: string;
  status: EntityAlertStatus;
};

/** source_kind del plan → linked_kind de las transacciones de esa entidad. */
const SOURCE_TO_LINK: Record<string, string> = {
  debt: "debt",
  goal: "goal",
  policy: "policy",
  dividend: "holding",
  rental: "rental",
};

/**
 * Compara cada línea derivada del plan contra lo vinculado a su entidad en
 * el periodo. Los recurrentes no tienen linked_kind propio (van por
 * recurring_item_id) y quedan fuera por ahora.
 */
export function buildEntityAlerts(
  derivedItems: BudgetItem[],
  transactions: Transaction[],
): EntityAlert[] {
  // Suma de lo real por (linkedKind, linkedId). El plan de gastos se compara
  // contra gastos; el de ingresos (dividendos) contra ingresos.
  const realByEntity = new Map<string, number>();
  for (const t of transactions) {
    const kind = t.linkedKind ?? "none";
    if (kind === "none" || !t.linkedId) continue;
    const key = `${kind}:${t.linkedId}:${t.kind === "ingreso" ? "income" : "expense"}`;
    realByEntity.set(key, (realByEntity.get(key) ?? 0) + t.amount);
  }

  const alerts: EntityAlert[] = [];
  for (const item of derivedItems) {
    const sk = item.sourceKind ?? "manual";
    if (sk === "manual" || sk === "recurring" || !item.sourceId) continue;
    const linkKind = SOURCE_TO_LINK[sk];
    if (!linkKind) continue;
    const real = realByEntity.get(`${linkKind}:${item.sourceId}:${item.type}`) ?? 0;
    const planned = item.amount;
    const ratio = planned > 0 ? real / planned : 0;
    const status: EntityAlertStatus =
      real <= 0 ? "sin_movimiento" : ratio < 0.95 ? "parcial" : ratio <= 1.05 ? "cumplido" : "excedido";
    alerts.push({
      sourceKind: sk,
      sourceId: item.sourceId,
      name: item.name,
      planned,
      real: Math.round(real),
      currency: item.currency,
      status,
    });
  }
  // Lo problemático primero: excedido, sin movimiento, parcial, cumplido.
  const order: Record<EntityAlertStatus, number> = {
    excedido: 0,
    sin_movimiento: 1,
    parcial: 2,
    cumplido: 3,
  };
  return alerts.sort((a, b) => order[a.status] - order[b.status]);
}
