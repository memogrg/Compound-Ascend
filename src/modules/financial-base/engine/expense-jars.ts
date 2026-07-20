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

/**
 * Línea de presupuesto cruda del periodo (solo gasto). El engine la usa para
 * detectar las que NO llegaron a pintarse en ningún frasco.
 */
export type BudgetLine = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  /** Plan derivado: las líneas vinculadas se pintan por (sourceKind, sourceId), no por categoría. */
  sourceKind?: string;
  sourceId?: string | null;
};

/**
 * Transacción de gasto cruda del periodo. El engine la usa para detectar el
 * gasto real que suma en "Gastado" pero no se pinta en ningún frasco.
 */
export type RealTxnLine = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  /** Vínculo a una entidad: se pinta en su frasco vinculado por linkedId, no por categoría. */
  linkedKind?: string;
  linkedId?: string | null;
  /** false = off-budget: no suma en "Gastado" ni es huérfana. */
  countsInBudget?: boolean;
};

/** Por qué una línea quedó fuera de todo frasco (chip en la UI). */
export type OrphanReason =
  | "sin_categoria"
  | "categoria_oculta"
  | "categoria_inactiva"
  | "categoria_inexistente"
  | "no_renderizada";

export type OrphanLine = {
  id: string;
  name: string;
  /** Monto en la moneda de visualización (el mismo criterio que el titular). */
  amount: number;
  /** Monto sin convertir + su moneda. */
  nativeAmount: number;
  currency: string;
  reason: OrphanReason;
  /**
   * Vínculo de la transacción (solo huérfanos de GASTO REAL). Si está presente y
   * != 'none', borrarla REVIERTE el ledger de la entidad — la UI lo advierte.
   * `linkedName` es el nombre resuelto de la entidad (p.ej. "Beauty Fernanda").
   */
  linkedKind?: string;
  linkedId?: string | null;
  linkedName?: string | null;
};

export const ORPHAN_GROUP = "__orphans__";

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
    }
  | {
      /**
       * Frasco "Por reasignar": líneas de presupuesto que SUMAN en el titular
       * pero cuya categoría ya no se pinta en ningún frasco (oculta, inactiva,
       * borrada o sin categoría). Existe para que el total siempre cuadre con
       * lo visible: nada se descuenta ni se pierde en silencio.
       */
      kind: "orphan";
      group: typeof ORPHAN_GROUP;
      name: string;
      color: string;
      icon: string;
      /** Líneas de PRESUPUESTO sin frasco. `total` es su suma. */
      items: OrphanLine[];
      total: number;
      /**
       * Transacciones de GASTO REAL sin frasco. `realTotal` es su suma.
       *
       * `total` y `realTotal` se mantienen SEPARADOS a propósito: son dos
       * invariantes distintos (planificado vs gastado) y sumarlos en un solo
       * número reintroduciría, en la otra columna, el mismo descuadre que este
       * frasco existe para eliminar.
       */
      realItems: OrphanLine[];
      realTotal: number;
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
  /** Líneas de gasto crudas del periodo; de acá salen los huérfanos. */
  budgetItems?: BudgetLine[];
  /** Transacciones de gasto del periodo; de acá salen los huérfanos de gasto real. */
  realTxns?: RealTxnLine[];
  /** Bases ocultas por override (solo para etiquetar el motivo del huérfano). */
  hiddenCategoryIds?: string[];
}): Jar[] {
  const { tree, budgetByKey, realByKey, entities, fmt, linkedBudget } = args;
  const jars: Jar[] = [];

  // Lo que REALMENTE se pintó, por las dos claves con las que se pinta:
  // los frascos normales por categoría, los vinculados por (sourceKind, sourceId).
  // Derivar los huérfanos de acá — y no re-derivando las reglas de render — es lo
  // que hace que el bucket se ajuste solo si mañana cambia una regla.
  const renderedCategoryIds = new Set<string>();
  const renderedSources = new Set<string>();

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
      // Las líneas derivadas se pintan por entidad, no por categoría (las de
      // metas nacen con categoryId NULL a propósito) → se marcan por source.
      for (const e of entityList) renderedSources.add(`${linked.linkedKind}:${e.id}`);

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
      renderedCategoryIds.add(group.id);
    }
    for (const c of group.children) {
      const dSpent = realByKey[c.id]?.value ?? 0;
      const dBudget = budgetByKey[c.id]?.value ?? 0;
      // Las de sistema no favoritas se omiten SOLO si están vacías: si tienen
      // plata se pintan igual (mismo criterio que "{Grupo} (general)"), en vez
      // de esconder datos reales o mandarlos a "Por reasignar".
      if (!(c.isFavorite || !c.isSystem) && dBudget <= 0 && dSpent <= 0) continue;
      envelopes.push({
        id: c.id,
        name: c.name,
        spent: dSpent,
        budget: dBudget,
        ...nativeOf(c.id, dSpent, dBudget),
      });
      renderedCategoryIds.add(c.id);
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

  // ── "Por reasignar": lo que suma en los titulares pero no se pintó en ningún
  // lado. Presupuesto y gasto real se derivan por separado (dos invariantes
  // distintos) pero contra los MISMOS Sets: son los mismos frascos.
  const hidden = new Set(args.hiddenCategoryIds ?? []);

  const toDisplay = (amount: number, currency: string): number =>
    currency && displayCur && currency !== displayCur
      ? convertCurrency(amount, currency, displayCur, rates)
      : amount;

  const reasonFor = (categoryId: string | null): OrphanReason =>
    categoryId == null
      ? "sin_categoria"
      : hidden.has(categoryId)
        ? "categoria_oculta"
        : // Sin la lista cruda de categorías no se puede distinguir inactiva de
          // inexistente → no se inventa el motivo.
          "no_renderizada";

  /** ¿La línea/transacción se pintó? Doble vía: por entidad vinculada o por categoría. */
  const isRendered = (x: {
    categoryId: string | null;
    kind?: string;
    entityId?: string | null;
  }): boolean =>
    (!!x.kind && !!x.entityId && renderedSources.has(`${x.kind}:${x.entityId}`)) ||
    (x.categoryId != null && renderedCategoryIds.has(x.categoryId));

  const items: OrphanLine[] = (args.budgetItems ?? [])
    .filter((it) => !isRendered({ categoryId: it.categoryId, kind: it.sourceKind, entityId: it.sourceId }))
    .map((it) => ({
      id: it.id,
      name: it.name,
      // Mismo criterio de conversión que el titular, si no el invariante
      // (visible + huérfanos === total) se rompe con montos en otra moneda.
      amount: toDisplay(it.amount, it.currency),
      nativeAmount: it.amount,
      currency: it.currency,
      reason: reasonFor(it.categoryId),
    }));

  // Nombre de entidad por id (para avisar qué ledger revierte un borrado
  // vinculado). Los ids son uuids únicos → un mapa plano cross-kind alcanza.
  const entityNameById = new Map<string, string>();
  for (const list of Object.values(entities)) {
    for (const e of list) entityNameById.set(e.id, e.name);
  }

  const realItems: OrphanLine[] = (args.realTxns ?? [])
    // Off-budget no suma en "Gastado" (mismo corte que getRealTotals) → tampoco
    // puede ser huérfano: no hay nada que reconciliar.
    .filter((t) => t.countsInBudget !== false)
    .filter((t) => !isRendered({ categoryId: t.categoryId, kind: t.linkedKind, entityId: t.linkedId }))
    .map((t) => ({
      id: t.id,
      name: t.name,
      amount: toDisplay(t.amount, t.currency),
      nativeAmount: t.amount,
      currency: t.currency,
      reason: reasonFor(t.categoryId),
      linkedKind: t.linkedKind,
      linkedId: t.linkedId ?? null,
      linkedName: t.linkedId ? (entityNameById.get(t.linkedId) ?? null) : null,
    }));

  if (items.length > 0 || realItems.length > 0) {
    jars.push({
      kind: "orphan",
      group: ORPHAN_GROUP,
      name: "Por reasignar",
      color: "var(--warn)",
      icon: "info",
      items,
      total: items.reduce((t, it) => t + it.amount, 0),
      realItems,
      realTotal: realItems.reduce((t, it) => t + it.amount, 0),
    });
  }

  return jars;
}
