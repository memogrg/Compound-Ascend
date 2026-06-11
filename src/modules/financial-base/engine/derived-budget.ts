/**
 * Plan derivado (Fase 3 · interconexión): el presupuesto se DERIVA de las
 * entidades. Cada entidad con pago/aporte recurrente produce una línea
 * deseada de budget_items con source_kind/source_id; este engine calcula
 * el diff contra las líneas derivadas existentes del periodo.
 * Puro y testeable: el IO vive en derived-budget-service.
 */
import { monthlyize, type Frequency } from "@/modules/financial-base/engine/monthlyize";
import type { BudgetSourceKind } from "@/modules/financial-base/types";

export type DesiredLine = {
  type: "income" | "expense";
  name: string;
  amount: number; // mensual, en la moneda de la entidad
  currency: string;
  categoryId: string | null;
  sourceKind: Exclude<BudgetSourceKind, "manual">;
  sourceId: string;
};

export type ExistingDerived = {
  id: string;
  type: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  sourceKind: string;
  sourceId: string | null;
};

/** Frecuencia tolerante: texto libre de la entidad → Frequency conocida. */
export function toMonthly(amount: number, frequency: string | null | undefined): number {
  const f = (frequency ?? "mensual") as Frequency;
  const monthly = monthlyize(amount, f);
  // Frecuencia desconocida → asume que ya es mensual (factor 0 solo para 'unico').
  return monthly > 0 || f === "unico" ? monthly : Math.round(amount * 100) / 100;
}

export type DerivedDiff = {
  toInsert: DesiredLine[];
  toUpdate: { id: string; line: DesiredLine }[];
  toDeleteIds: string[];
};

/**
 * Diff por (sourceKind, sourceId): inserta lo nuevo, actualiza lo cambiado
 * (nombre/monto/moneda/categoría), borra las líneas cuya entidad ya no
 * existe o dejó de aportar. Las líneas manuales nunca entran aquí.
 */
export function diffDerived(existing: ExistingDerived[], desired: DesiredLine[]): DerivedDiff {
  const key = (k: string, id: string | null) => `${k}:${id ?? ""}`;
  const desiredByKey = new Map(desired.map((d) => [key(d.sourceKind, d.sourceId), d]));
  const existingByKey = new Map(existing.map((e) => [key(e.sourceKind, e.sourceId), e]));

  const toInsert: DesiredLine[] = [];
  const toUpdate: { id: string; line: DesiredLine }[] = [];
  const toDeleteIds: string[] = [];

  for (const [k, d] of desiredByKey) {
    const e = existingByKey.get(k);
    if (!e) {
      toInsert.push(d);
    } else if (
      e.name !== d.name ||
      Math.abs(e.amount - d.amount) > 0.004 ||
      e.currency !== d.currency ||
      (e.categoryId ?? null) !== (d.categoryId ?? null) ||
      e.type !== d.type
    ) {
      toUpdate.push({ id: e.id, line: d });
    }
  }
  for (const [k, e] of existingByKey) {
    if (!desiredByKey.has(k)) toDeleteIds.push(e.id);
  }
  return { toInsert, toUpdate, toDeleteIds };
}
