import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Lógica de servicio de la personalización por hogar (Fase 1): forkCategory /
 * hideCategory / revert, con reasignación HOUSEHOLD-SCOPED y gating de editor.
 * Cliente Supabase falso que CAPTURA inserts/updates/deletes por tabla para
 * inspeccionar payloads y filtros (household_id vs user_id).
 */
const h = vi.hoisted(() => ({
  userId: "u1",
  householdId: "H" as string | null,
  isEditor: true,
  baseRow: null as Record<string, unknown> | null,
  rawCats: [] as Record<string, unknown>[],
  overrideRow: null as Record<string, unknown> | null,
  ops: {
    inserts: {} as Record<string, Record<string, unknown>[]>,
    updates: [] as { table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }[],
    deletes: [] as { table: string; filters: Record<string, unknown> }[],
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: h.userId }) }));
vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: async () => h.householdId,
  isActiveHouseholdEditor: async () => h.isEditor,
}));

function readBuilder(table: string) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    or: () => b,
    is: () => b,
    order: () => b,
    maybeSingle: async () => {
      if (table === "expense_categories") return { data: h.baseRow, error: null };
      if (table === "category_overrides") return { data: h.overrideRow, error: null };
      return { data: null, error: null };
    },
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => {
      const data = table === "expense_categories" ? h.rawCats : [];
      return Promise.resolve({ data, error: null }).then(r, j);
    },
  };
  return b;
}

function filterBuilder(record: () => void) {
  const b: Record<string, unknown> = {
    eq: (_k: string, _v: unknown) => b,
    is: (_k: string, _v: unknown) => b,
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => {
      record();
      return Promise.resolve({ error: null }).then(r, j);
    },
  };
  return b;
}

function updateBuilder(table: string, payload: Record<string, unknown>) {
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    is: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => {
      h.ops.updates.push({ table, payload, filters });
      return Promise.resolve({ error: null }).then(r, j);
    },
  };
  return b;
}

function insertResult(table: string) {
  return {
    select: () => ({ maybeSingle: async () => ({ data: { id: `new-${table}` }, error: null }) }),
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(r, j),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => ({
      select: (...args: unknown[]) => (readBuilder(table).select as (...a: unknown[]) => unknown)(...args),
      insert: (payload: Record<string, unknown>) => {
        (h.ops.inserts[table] ??= []).push(payload);
        return insertResult(table);
      },
      update: (payload: Record<string, unknown>) => updateBuilder(table, payload),
      delete: () => {
        const filters: Record<string, unknown> = {};
        const rec = filterBuilder(() => h.ops.deletes.push({ table, filters }));
        // Envuelve eq/is para capturar los filtros del delete.
        return {
          eq: (k: string, v: unknown) => {
            filters[k] = v;
            return rec;
          },
        };
      },
    }),
  }),
}));

import {
  forkCategory,
  hideCategory,
  unforkCategory,
} from "@/modules/financial-base/services/categories-service";

const MOVEMENT_TABLES = ["transactions", "budget_items", "expense_items"];

beforeEach(() => {
  h.userId = "u1";
  h.householdId = "H";
  h.isEditor = true;
  h.baseRow = null;
  h.rawCats = [];
  h.overrideRow = null;
  h.ops.inserts = {};
  h.ops.updates = [];
  h.ops.deletes = [];
});

describe("forkCategory · preserva key/parent_id/linked_kind/category_type", () => {
  it("crea la copia con la key y el vínculo del original + patch, y registra el override", async () => {
    h.baseRow = {
      key: "g_deudas",
      parent_id: "g1",
      linked_kind: "debt",
      category_type: "expense",
      name: "Deudas",
      icon: "💳",
      color: "#111",
      is_favorite: false,
    };
    const forkId = await forkCategory("base-1", { name: "Mis deudas", isFavorite: true });
    expect(forkId).toBe("new-expense_categories");

    const copy = h.ops.inserts["expense_categories"]?.[0] as Record<string, unknown>;
    expect(copy.key).toBe("g_deudas"); // key preservada
    expect(copy.parent_id).toBe("g1"); // parent preservado
    expect(copy.linked_kind).toBe("debt"); // vínculo preservado
    expect(copy.category_type).toBe("expense");
    expect(copy.household_id).toBe("H"); // household del hogar activo
    expect(copy.is_system).toBe(false);
    expect(copy.name).toBe("Mis deudas"); // patch aplicado
    expect(copy.is_favorite).toBe(true);
    expect(copy.icon).toBe("💳"); // no venía en el patch → hereda del original

    const ov = h.ops.inserts["category_overrides"]?.[0] as Record<string, unknown>;
    expect(ov).toMatchObject({
      category_id: "base-1",
      hidden: true,
      fork_id: "new-expense_categories",
      household_id: "H",
    });
  });

  it("reasigna los movimientos de la base al fork, filtrando por HOGAR (no user_id)", async () => {
    h.baseRow = { key: null, parent_id: null, linked_kind: null, category_type: "expense", name: "X" };
    await forkCategory("base-1", {});
    for (const table of MOVEMENT_TABLES) {
      const up = h.ops.updates.find((u) => u.table === table);
      expect(up, `update en ${table}`).toBeTruthy();
      expect(up!.payload.category_id).toBe("new-expense_categories");
      expect(up!.filters.category_id).toBe("base-1");
      expect(up!.filters.household_id).toBe("H"); // hogar → mueve también lo de otros miembros
      expect(up!.filters.user_id).toBeUndefined();
    }
  });
});

describe("hideCategory · frasco + descendientes + household scope", () => {
  it("reasigna los movimientos del frasco Y de cada sobre descendiente al destino", async () => {
    // Frasco g1 con dos sobres s1/s2 (rawCats para visibleDescendantIds).
    h.rawCats = [
      { id: "g1", parent_id: null, name: "Hogar", is_active: true, is_system: true, category_type: "expense", sort_order: 0 },
      { id: "s1", parent_id: "g1", name: "Luz", is_active: true, is_system: true, category_type: "expense", sort_order: 0 },
      { id: "s2", parent_id: "g1", name: "Agua", is_active: true, is_system: true, category_type: "expense", sort_order: 0 },
      { id: "g2", parent_id: null, name: "Ocio", is_active: true, is_system: true, category_type: "expense", sort_order: 0 },
    ];
    await hideCategory("g1", "dest");

    // Cada una de g1/s1/s2 reasigna en las 3 tablas de movimientos (g2 NO).
    const movedFrom = new Set(
      h.ops.updates.filter((u) => u.table === "transactions").map((u) => u.filters.category_id),
    );
    expect(movedFrom).toEqual(new Set(["g1", "s1", "s2"]));
    for (const u of h.ops.updates) {
      expect(u.payload.category_id).toBe("dest");
      expect(u.filters.household_id).toBe("H");
    }

    const ov = h.ops.inserts["category_overrides"]?.[0] as Record<string, unknown>;
    expect(ov).toMatchObject({ category_id: "g1", hidden: true, fork_id: null, household_id: "H" });
  });

  it("modo SOLO (sin hogar): reasigna filtrando por user_id, no por household_id", async () => {
    h.householdId = null;
    h.rawCats = [
      { id: "s1", parent_id: "g1", name: "Luz", is_active: true, is_system: false, category_type: "expense", sort_order: 0 },
    ];
    await hideCategory("s1", "dest");
    const up = h.ops.updates.find((u) => u.table === "transactions");
    expect(up!.filters.user_id).toBe("u1");
    expect(up!.filters.household_id).toBeUndefined();
    const ov = h.ops.inserts["category_overrides"]?.[0] as Record<string, unknown>;
    expect(ov.household_id).toBeNull();
  });

  it("sin reassignToId → no mueve movimientos, solo registra el override", async () => {
    await hideCategory("s1");
    expect(h.ops.updates).toHaveLength(0);
    expect(h.ops.inserts["category_overrides"]).toHaveLength(1);
  });
});

describe("gating de editor", () => {
  it("un viewer del hogar NO puede ocultar", async () => {
    h.isEditor = false;
    await expect(hideCategory("s1", "dest")).rejects.toThrow(/editor del hogar/i);
    expect(h.ops.updates).toHaveLength(0);
    expect(h.ops.inserts["category_overrides"] ?? []).toHaveLength(0);
  });

  it("un viewer del hogar NO puede forkear", async () => {
    h.isEditor = false;
    h.baseRow = { key: null, parent_id: null, linked_kind: null, category_type: "expense", name: "X" };
    await expect(forkCategory("base-1", {})).rejects.toThrow(/editor del hogar/i);
    expect(h.ops.inserts["expense_categories"] ?? []).toHaveLength(0);
  });
});

describe("unforkCategory · revierte copia + override", () => {
  it("devuelve los movimientos del fork a la base y borra copia y override", async () => {
    h.overrideRow = { id: "ov1", fork_id: "fork1" };
    await unforkCategory("base-1");

    // Movimientos: fork1 → base-1 (household scope).
    const up = h.ops.updates.find((u) => u.table === "transactions");
    expect(up!.filters.category_id).toBe("fork1");
    expect(up!.payload.category_id).toBe("base-1");
    // Borra la copia y el override.
    expect(h.ops.deletes).toEqual(
      expect.arrayContaining([
        { table: "expense_categories", filters: { id: "fork1" } },
        { table: "category_overrides", filters: { id: "ov1" } },
      ]),
    );
  });
});
