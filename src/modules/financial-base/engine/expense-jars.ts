/**
 * Modelo de "frascos" (jars) del tab de Gastos — puro y testeable.
 *
 * Frasco NORMAL (Vivienda…Educación): el grupo de Nivel 1 con sus hojas
 * favoritas/propias como sobres (presupuesto + gastado), más sugerencias de
 * benchmark para "Crear nueva subcategoría".
 *
 * Frasco VINCULADO (Libertad/Deudas/Defensa/Ahorro): despliega las entidades
 * reales del módulo origen (inversiones, deudas, pólizas, metas); si no hay,
 * muestra el texto vacío exacto y un CTA al pop-up de creación del módulo.
 */
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import { mergeSuggestions } from "@/modules/financial-base/engine/expense-suggestions";

export type KeyedTotals = Record<string, { label: string; value: number }>;

export type JarEnvelope = { id: string; name: string; spent: number; budget: number };
/**
 * Elemento de un frasco vinculado. `amount` es el monto formateado (presupuesto
 * de la obligación). Cuando el frasco es budget-aware (p.ej. Deudas), trae además
 * `budget`/`spent`/`remaining` numéricos (moneda principal) para la barra.
 */
export type JarItem = {
  id: string;
  name: string;
  sub: string;
  amount: string;
  delta?: string;
  budget?: number;
  spent?: number;
  remaining?: number;
  /** Parte del gastado que fue pago extraordinario (abono a capital). */
  extraordinary?: number;
};

export type LinkedKind = "holding" | "debt" | "policy" | "goal";

export type Jar =
  | {
      kind: "normal";
      group: string;
      name: string;
      color: string;
      icon: string;
      isSystem: boolean;
      envelopes: JarEnvelope[];
      suggestions: string[];
    }
  | {
      kind: "linked";
      group: string;
      name: string;
      color: string;
      icon: string;
      linkedKind: LinkedKind;
      items: JarItem[];
      emptyText: string;
      cta: { label: string; href: string };
      fixedFunds?: { name: string; sub: string }[];
      /** true cuando cada obligación trae presupuesto/gastado (Deudas). */
      budgetAware?: boolean;
      /** Totales del frasco = suma de sus obligaciones (solo budget-aware). */
      totals?: { budget: number; spent: number; remaining: number };
      /** Categoría de sistema a la que se imputa el pago (para Registrar gasto). */
      paymentCategoryId?: string | null;
    };

/**
 * Datos de presupuesto/gastado de un linkedKind budget-aware (p.ej. Deudas):
 * la cuota mensual por entidad (fuente: línea derivada `source_kind`), el
 * pagado del periodo por entidad y la categoría de sistema del pago.
 */
export type LinkedBudgetData = {
  bySource: Record<string, number>; // entityId → cuota mensual (moneda principal)
  spentById: Record<string, number>; // entityId → pagado en el periodo
  /** entityId → pagado extraordinario (subconjunto de spentById). */
  extraordinaryById?: Record<string, number>;
  paymentCategoryId: string | null;
};
/** Config por linkedKind; solo los presentes se vuelven budget-aware. */
export type LinkedBudgetConfig = Partial<Record<LinkedKind, LinkedBudgetData>>;

/** Entidad real ya resuelta (id + etiqueta + monto numérico + subtítulo). */
export type JarEntity = { id: string; name: string; sub: string; amount: number; delta?: string };
export type JarEntities = {
  holding: JarEntity[];
  rental: JarEntity[];
  debt: JarEntity[];
  policy: JarEntity[];
  goal: JarEntity[];
};

/** Config de los grupos vinculados (texto vacío + CTA deep-link al módulo). */
const LINKED_GROUPS: Record<
  string,
  {
    linkedKind: "holding" | "debt" | "policy" | "goal";
    emptyText: string;
    cta: { label: string; href: string };
    fixedFunds?: { name: string; sub: string }[];
  }
> = {
  g_libertad: {
    linkedKind: "holding",
    emptyText: "No existen inversiones",
    cta: { label: "Crear inversión", href: "/patrimonio?new=holding" },
  },
  g_deudas: {
    linkedKind: "debt",
    emptyText: "No hay Deudas Mapeadas",
    cta: { label: "Ingresar deuda", href: "/deudas?new=debt" },
  },
  g_defensa: {
    linkedKind: "policy",
    emptyText: "No hay Pólizas activas Mapeados",
    cta: { label: "Añadir póliza activa", href: "/patrimonio/proteccion?new=policy" },
  },
  g_ahorro_lp: {
    linkedKind: "goal",
    emptyText: "No existen Objetivos activos mapeados",
    cta: { label: "Ingresar objetivo", href: "/control-financiero?new=goal" },
    // Fondos fijos siempre sugeridos en el modal de ahorro.
    fixedFunds: [
      { name: "Fondo de emergencia", sub: "Siempre disponible" },
      { name: "Fondo de paz", sub: "Siempre disponible" },
    ],
  },
};

export function buildExpenseJars(args: {
  tree: CategoryNode[];
  budgetByKey: KeyedTotals;
  realByKey: KeyedTotals;
  entities: JarEntities;
  fmt: (n: number) => string;
  /** Activa el modo budget-aware por linkedKind (esta entrega: solo `debt`). */
  linkedBudget?: LinkedBudgetConfig;
}): Jar[] {
  const { tree, budgetByKey, realByKey, entities, fmt, linkedBudget } = args;
  const jars: Jar[] = [];

  for (const group of tree) {
    const key = group.key ?? "";
    const linked = LINKED_GROUPS[key];

    if (linked) {
      const entityList =
        linked.linkedKind === "holding"
          ? [...entities.holding, ...entities.rental]
          : entities[linked.linkedKind];
      const lb = linkedBudget?.[linked.linkedKind];

      if (lb) {
        // Budget-aware: cada obligación trae cuota (línea derivada, fallback al
        // monto de la entidad), pagado del periodo y restante. Totales = suma.
        const items: JarItem[] = entityList.map((e) => {
          const budget = lb.bySource[e.id] ?? e.amount;
          const spent = lb.spentById[e.id] ?? 0;
          return {
            id: e.id,
            name: e.name,
            sub: e.sub,
            amount: fmt(budget),
            delta: e.delta,
            budget,
            spent,
            remaining: budget - spent,
            extraordinary: lb.extraordinaryById?.[e.id] ?? 0,
          };
        });
        const totals = items.reduce(
          (t, it) => ({
            budget: t.budget + (it.budget ?? 0),
            spent: t.spent + (it.spent ?? 0),
            remaining: t.remaining + (it.remaining ?? 0),
          }),
          { budget: 0, spent: 0, remaining: 0 },
        );
        jars.push({
          kind: "linked",
          group: group.id,
          name: group.name,
          color: group.color ?? "var(--muted-2)",
          icon: group.icon ?? "spark",
          linkedKind: linked.linkedKind,
          items,
          emptyText: linked.emptyText,
          cta: linked.cta,
          fixedFunds: linked.fixedFunds,
          budgetAware: true,
          totals,
          paymentCategoryId: lb.paymentCategoryId,
        });
        continue;
      }

      jars.push({
        kind: "linked",
        group: group.id,
        name: group.name,
        color: group.color ?? "var(--muted-2)",
        icon: group.icon ?? "spark",
        linkedKind: linked.linkedKind,
        items: entityList.map((e) => ({
          id: e.id,
          name: e.name,
          sub: e.sub,
          amount: fmt(e.amount),
          delta: e.delta,
        })),
        emptyText: linked.emptyText,
        cta: linked.cta,
        fixedFunds: linked.fixedFunds,
      });
      continue;
    }

    // Frasco normal: sobres = hojas favoritas o propias del usuario.
    const envelopes: JarEnvelope[] = [];
    // Gasto/plan categorizado al grupo mismo → sobre "{Grupo} (general)".
    const groupSpent = realByKey[group.id]?.value ?? 0;
    const groupBudget = budgetByKey[group.id]?.value ?? 0;
    if (groupSpent > 0 || groupBudget > 0) {
      envelopes.push({
        id: group.id,
        name: `${group.name} (general)`,
        spent: groupSpent,
        budget: groupBudget,
      });
    }
    for (const c of group.children) {
      if (!(c.isFavorite || !c.isSystem)) continue;
      envelopes.push({
        id: c.id,
        name: c.name,
        spent: realByKey[c.id]?.value ?? 0,
        budget: budgetByKey[c.id]?.value ?? 0,
      });
    }

    const nonFavoriteLeafNames = group.children
      .filter((c) => c.isSystem && !c.isFavorite)
      .map((c) => c.name);

    jars.push({
      kind: "normal",
      group: group.id,
      name: group.name,
      color: group.color ?? "var(--muted-2)",
      icon: group.icon ?? "spark",
      isSystem: group.isSystem,
      envelopes,
      suggestions: mergeSuggestions({
        groupKey: group.key,
        nonFavoriteLeafNames,
        envelopeNames: envelopes.map((e) => e.name),
      }),
    });
  }

  return jars;
}
