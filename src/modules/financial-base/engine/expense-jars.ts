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
import { convertCurrency } from "@/lib/fx";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import { mergeSuggestions } from "@/modules/financial-base/engine/expense-suggestions";

export type KeyedTotals = Record<string, { label: string; value: number }>;

export type JarEnvelope = {
  id: string;
  name: string;
  spent: number; // display (para el total del frasco)
  budget: number; // display
  nativeSpent: number; // en la moneda del sobre
  nativeBudget: number; // en la moneda del sobre
  currency: string; // moneda del sobre
};
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
  /** Categoría (frasco) del ahorro; se usa para agrupar en secciones. */
  categoryId?: string | null;
};

/** Sección de un frasco vinculado: agrupa items por categoría (solo ahorros). */
export type JarSection = { key: string; name: string; items: JarItem[] };

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
      /** Agrupación visual de `items` por categoría (solo ahorros). Aditivo:
       *  `items` sigue siendo la lista plana. "Generales" va primero. */
      sections?: JarSection[];
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
export type JarEntity = {
  id: string;
  name: string;
  sub: string;
  amount: number;
  delta?: string;
  /** Categoría (frasco) del ahorro; solo se llena para goals. Para agrupar. */
  categoryId?: string | null;
  /** goal_type del ahorro (p.ej. 'defensa:fondo_paz'); para deduplicar fondos fijos. */
  goalType?: string | null;
};
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
    /** Fondos SUGERIDOS (Ahorro): se ocultan si el usuario ya creó ese fondo. */
    fixedFunds?: { name: string; sub: string; goalType?: string }[];
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
    // Fondos SUGERIDOS en el modal de ahorro (se ocultan si ya existen).
    fixedFunds: [
      { name: "Fondo de emergencia", sub: "Siempre disponible", goalType: "defensa:fondo_emergencia" },
      { name: "Fondo de paz", sub: "Siempre disponible", goalType: "defensa:fondo_paz" },
    ],
  },
};

/**
 * Agrupa los items de ahorro por el GRUPO de nivel superior de su `categoryId`
 * (el grupo mismo o el padre de la hoja, resuelto con el `tree`). "Generales" va
 * PRIMERO con los items sin categoría (o cuya categoría no resuelve). Las
 * secciones vacías NO se emiten; el resto sigue el orden del `tree`. Es puro
 * reagrupamiento visual de los mismos items → no cambia totales ni presupuesto.
 */
function groupGoalSections(items: JarItem[], tree: CategoryNode[]): JarSection[] {
  const groupOf = (catId: string): CategoryNode | undefined =>
    tree.find((g) => g.id === catId || g.children.some((c) => c.id === catId));

  const generales: JarItem[] = [];
  const byGroup = new Map<string, JarItem[]>();
  for (const it of items) {
    const g = it.categoryId ? groupOf(it.categoryId) : undefined;
    if (!g) {
      generales.push(it);
      continue;
    }
    const arr = byGroup.get(g.id) ?? [];
    arr.push(it);
    byGroup.set(g.id, arr);
  }

  const sections: JarSection[] = [];
  if (generales.length > 0) {
    sections.push({ key: "generales", name: "Generales", items: generales });
  }
  for (const g of tree) {
    const arr = byGroup.get(g.id);
    if (arr && arr.length > 0) sections.push({ key: g.id, name: g.name, items: arr });
  }
  return sections;
}

const normalizeName = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Fondos SUGERIDOS que el usuario aún NO tiene: excluye una sugerencia si ya
 * existe una entidad real con su `goalType`, o (fallback, si la entidad no trae
 * goal_type) con el mismo nombre normalizado (sin acentos/mayúsculas). Si el
 * usuario ya tiene todos, devuelve [] (la sección de fijos no se renderiza).
 */
function filterFixedFunds<T extends { name: string; goalType?: string }>(
  fixedFunds: T[] | undefined,
  entityList: JarEntity[],
): T[] | undefined {
  if (!fixedFunds) return fixedFunds;
  return fixedFunds.filter(
    (f) =>
      !entityList.some((e) =>
        f.goalType && e.goalType
          ? e.goalType === f.goalType
          : normalizeName(e.name) === normalizeName(f.name),
      ),
  );
}

export function buildExpenseJars(args: {
  tree: CategoryNode[];
  budgetByKey: KeyedTotals;
  realByKey: KeyedTotals;
  entities: JarEntities;
  fmt: (n: number) => string;
  /** Moneda de visualización (origen de las conversiones a moneda nativa). */
  currency?: string;
  /** Presupuesto por sobre en su moneda nativa (para S2). */
  nativeBudgetByKey?: Record<string, { value: number; currency: string }>;
  rates?: Record<string, number>;
  /** Activa el modo budget-aware por linkedKind (esta entrega: solo `debt`). */
  linkedBudget?: LinkedBudgetConfig;
}): Jar[] {
  const { tree, budgetByKey, realByKey, entities, fmt, linkedBudget } = args;
  const jars: Jar[] = [];

  // Deriva los campos nativos de un sobre: presupuesto nativo (sin convertir) y
  // gastado convertido a la moneda del sobre (opción A). Si no llega el dato de
  // moneda nativa (fallback), los nativos igualan al display.
  const displayCur = args.currency ?? "";
  const rates = args.rates ?? {};
  const nativeOf = (id: string, displaySpent: number, displayBudget: number) => {
    const nb = args.nativeBudgetByKey?.[id];
    const cur = nb?.currency ?? displayCur;
    return {
      currency: cur,
      nativeBudget: nb?.value ?? displayBudget,
      nativeSpent:
        cur && displayCur && cur !== displayCur
          ? convertCurrency(displaySpent, displayCur, cur, rates)
          : displaySpent,
    };
  };

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
            categoryId: e.categoryId ?? null,
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
          fixedFunds: filterFixedFunds(linked.fixedFunds, entityList),
          budgetAware: true,
          totals,
          paymentCategoryId: lb.paymentCategoryId,
          // Ahorro: agrupación visual por categoría (no cambia items ni totals).
          sections: linked.linkedKind === "goal" ? groupGoalSections(items, tree) : undefined,
        });
        continue;
      }

      const plainItems: JarItem[] = entityList.map((e) => ({
        id: e.id,
        name: e.name,
        sub: e.sub,
        amount: fmt(e.amount),
        delta: e.delta,
        categoryId: e.categoryId ?? null,
      }));
      jars.push({
        kind: "linked",
        group: group.id,
        name: group.name,
        color: group.color ?? "var(--muted-2)",
        icon: group.icon ?? "spark",
        linkedKind: linked.linkedKind,
        items: plainItems,
        emptyText: linked.emptyText,
        cta: linked.cta,
        fixedFunds: filterFixedFunds(linked.fixedFunds, entityList),
        // Ahorro: agrupación visual por categoría (aditivo; items sigue plano).
        sections: linked.linkedKind === "goal" ? groupGoalSections(plainItems, tree) : undefined,
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
        ...nativeOf(group.id, groupSpent, groupBudget),
      });
    }
    for (const c of group.children) {
      if (!(c.isFavorite || !c.isSystem)) continue;
      const dSpent = realByKey[c.id]?.value ?? 0;
      const dBudget = budgetByKey[c.id]?.value ?? 0;
      envelopes.push({
        id: c.id,
        name: c.name,
        spent: dSpent,
        budget: dBudget,
        ...nativeOf(c.id, dSpent, dBudget),
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
