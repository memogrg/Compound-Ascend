import { describe, it, expect } from "vitest";
import { rollupByGroup } from "@/modules/financial-base/engine/budget-rollup";
import { findUnlinkedCandidates } from "@/modules/financial-base/engine/reconciliation";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { Transaction } from "@/modules/financial-base/types";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

/**
 * Fixtures que reflejan la taxonomía post-migración 0025: la hoja legada
 * 'deudas' (id intacto) vive ahora bajo el grupo nuevo "Deudas"; las
 * subcategorías nuevas traen linked_kind de fábrica.
 */
const cat = (over: Partial<Category>): Category => ({
  id: "x",
  key: null,
  name: "",
  defaultNature: null,
  parentId: null,
  icon: null,
  color: null,
  isFavorite: false,
  isEssential: false,
  isActive: true,
  isSystem: true,
  categoryType: "expense",
  sortOrder: 0,
  linkedKind: null,
  ...over,
});

const G_DEUDAS: CategoryNode = {
  ...cat({ id: "g-deudas", key: "g_deudas", name: "Deudas", color: "var(--warn)" }),
  children: [
    cat({ id: "deuda-tarjeta", key: "deuda_tarjeta", name: "Tarjeta de crédito", parentId: "g-deudas", linkedKind: "debt" }),
    // Hoja LEGADA re-parenteada: conserva su id histórico.
    cat({ id: "legacy-deudas-id", key: "deudas", name: "Otras deudas", parentId: "g-deudas", linkedKind: "debt" }),
  ],
};

const G_DEFENSA: CategoryNode = {
  ...cat({ id: "g-defensa", key: "g_defensa", name: "Defensa Patrimonial", color: "var(--c-protect)" }),
  children: [
    cat({ id: "seguro-vida", key: "seguro_vida", name: "Seguro de vida", parentId: "g-defensa", linkedKind: "policy" }),
  ],
};

const G_AHORRO: CategoryNode = {
  ...cat({ id: "g-ahorro", key: "g_ahorro_lp", name: "Ahorro a Largo Plazo", color: "var(--pos)" }),
  children: [
    cat({ id: "ahorro-metas", key: "ahorro_metas", name: "Metas de ahorro", parentId: "g-ahorro", linkedKind: "goal" }),
  ],
};

const TREE = [G_DEUDAS, G_DEFENSA, G_AHORRO];

describe("taxonomía de bloques (migración 0025)", () => {
  it("una transacción vieja (id de categoría intacto) reporta bajo el grupo NUEVO", () => {
    // El presupuesto/real siguen keyados por el id histórico de la hoja.
    const rows = rollupByGroup(
      { "legacy-deudas-id": { label: "Otras deudas", value: 40000 } },
      { "legacy-deudas-id": { label: "Otras deudas", value: 55000 } },
      TREE,
    );
    const deudas = rows.find((r) => r.groupId === "g-deudas");
    expect(deudas).toBeDefined();
    expect(deudas!.budget).toBe(40000);
    expect(deudas!.real).toBe(55000);
    // Nada cae en "Sin grupo": el reparenting no dejó huérfanas.
    expect(rows.some((r) => r.groupId === "__none__")).toBe(false);
  });

  it("las subcategorías nuevas resuelven su entidad por linked_kind", () => {
    const flat = TREE.flatMap((g) => [g, ...g.children]);
    const linkables: LinkableEntities = {
      debt: [{ id: "d1", name: "Tarjeta BAC", kind: "debt" }],
      goal: [{ id: "g1", name: "Fondo", kind: "goal" }],
      holding: [],
      policy: [{ id: "p1", name: "Vida", kind: "policy" }],
      rental: [],
    };
    const txn = (categoryId: string): Transaction => ({
      id: `t-${categoryId}`,
      kind: "gasto",
      description: null,
      merchantOrSource: "x",
      amount: 1000,
      currency: "CRC",
      occurredOn: "2026-06-10",
      categoryId,
      accountId: null,
      accountLabel: null,
      status: "confirmed",
      origin: "manual",
      receiptUrl: null,
      confirmedByUser: true,
      linkedKind: "none",
      linkedId: null,
      recurringItemId: null,
    });
    const out = findUnlinkedCandidates(
      [txn("deuda-tarjeta"), txn("legacy-deudas-id"), txn("seguro-vida"), txn("ahorro-metas")],
      flat,
      linkables,
    );
    expect(out.map((c) => c.suggestedKind)).toEqual(["debt", "debt", "policy", "goal"]);
  });
});
