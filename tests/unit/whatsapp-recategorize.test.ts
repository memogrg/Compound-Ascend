import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por el fake del cliente service-role.
const h = vi.hoisted(() => ({
  cats: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
  overrides: [] as Record<string, unknown>[],
  lastTxn: null as Record<string, unknown> | null,
  updateSpy: vi.fn(),
  updateError: null as string | null,
}));
const upsertRuleForUser = vi.fn(async (..._a: unknown[]) => {});

vi.mock("server-only", () => ({}));
vi.mock("@/modules/financial-base/services/rules-service", async (orig) => ({
  ...(await orig<typeof import("@/modules/financial-base/services/rules-service")>()),
  upsertRuleForUser: (...a: unknown[]) => upsertRuleForUser(...a),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    const thenable = (result: unknown) => ({
      then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(r, j),
    });
    // Builder de LECTURA (await → {data}): expense_categories / household_members /
    // category_overrides. Soporta select/or/eq/is/order encadenados.
    const listBuilder = (data: unknown) => {
      const b: Record<string, unknown> = {
        select: () => b,
        or: () => b,
        eq: () => b,
        is: () => b,
        order: () => b,
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(r, j),
      };
      return b;
    };
    return {
      from: (table: string) => {
        if (table === "expense_categories") return listBuilder(h.cats);
        if (table === "household_members") return listBuilder(h.members);
        if (table === "category_overrides") return listBuilder(h.overrides);
        // transactions: read (maybeSingle) o update (.eq().eq()).
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          in: () => b,
          order: () => b,
          limit: () => b,
          maybeSingle: () => Promise.resolve({ data: h.lastTxn, error: null }),
          update: (payload: Record<string, unknown>) => {
            h.updateSpy(payload);
            return { eq: () => ({ eq: () => thenable({ error: h.updateError }) }) };
          },
        };
        return b;
      },
    };
  },
}));

import {
  parseMoveCommand,
  resolveCategoryByName,
  moveLastTransaction,
  moveTransaction,
  getTransactionByAmount,
} from "@/lib/whatsapp/recategorize-service";

const cat = (over: Record<string, unknown>) => ({
  id: "c",
  name: "X",
  parent_id: null,
  category_type: "expense",
  is_active: true,
  user_id: null,
  ...over,
});

const CATS = [
  cat({ id: "c-paseos", name: "Paseos" }),
  cat({ id: "c-super", name: "Supermercado" }),
  cat({ id: "c-salario", name: "Salario", category_type: "income" }),
  cat({ id: "c-hogar", name: "Hogar" }), // padre → no hoja
  cat({ id: "c-luz", name: "Luz", parent_id: "c-hogar" }),
  cat({ id: "c-cf", name: "Comida fuera" }),
  cat({ id: "c-cc", name: "Comida casa" }),
];

beforeEach(() => {
  h.cats = CATS;
  h.members = [];
  h.overrides = [];
  h.lastTxn = null;
  h.updateError = null;
  h.updateSpy.mockClear();
  upsertRuleForUser.mockClear();
});

// ---------------------------------------------------------------------------
// parseMoveCommand (puro)
// ---------------------------------------------------------------------------
describe("parseMoveCommand", () => {
  it("parsea 'mover a Paseos' (último, sin tocar regla)", () => {
    expect(parseMoveCommand("mover a Paseos")).toEqual({
      sobre: "Paseos",
      alsoRule: false,
      amount: null,
    });
  });
  it("parsea 'mover a Paseos siempre' (toca regla)", () => {
    expect(parseMoveCommand("mover a Paseos siempre")).toEqual({
      sobre: "Paseos",
      alsoRule: true,
      amount: null,
    });
  });
  it("acepta cambiar/recategorizar y 'a futuro'", () => {
    expect(parseMoveCommand("cambiar Comida fuera")).toEqual({
      sobre: "Comida fuera",
      alsoRule: false,
      amount: null,
    });
    expect(parseMoveCommand("recategorizar a Super a futuro")).toEqual({
      sobre: "Super",
      alsoRule: true,
      amount: null,
    });
  });
  it("parsea selector de monto: 'mover el de 12000 a Paseos'", () => {
    expect(parseMoveCommand("mover el de 12000 a Paseos")).toEqual({
      sobre: "Paseos",
      alsoRule: false,
      amount: 12000,
    });
  });
  it("monto con separador de miles + 'siempre': 'mover el de 12.000 a Paseos siempre'", () => {
    expect(parseMoveCommand("mover el de 12.000 a Paseos siempre")).toEqual({
      sobre: "Paseos",
      alsoRule: true,
      amount: 12000,
    });
  });
  it("monto sin 'el' ni 'a': 'mover de 5000 a Comida fuera' / 'cambiar el gasto de 800 a Super'", () => {
    expect(parseMoveCommand("mover de 5000 a Comida fuera")).toEqual({
      sobre: "Comida fuera",
      alsoRule: false,
      amount: 5000,
    });
    expect(parseMoveCommand("cambiar el gasto de 800 a Super")).toEqual({
      sobre: "Super",
      alsoRule: false,
      amount: 800,
    });
  });
  it("no confunde un sobre con 'de' sin dígitos: 'mover a Cuentas de casa'", () => {
    expect(parseMoveCommand("mover a Cuentas de casa")).toEqual({
      sobre: "Cuentas de casa",
      alsoRule: false,
      amount: null,
    });
  });
  it("ignora lo que no es comando", () => {
    expect(parseMoveCommand("gasté 12000 en super")).toBeNull();
    expect(parseMoveCommand("¿cuánto gasté?")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveCategoryByName (service-role)
// ---------------------------------------------------------------------------
describe("resolveCategoryByName", () => {
  it("match exacto (normalizado, ignora acentos/mayúsculas)", async () => {
    const r = await resolveCategoryByName("u1", "paseos", "gasto");
    expect(r).toEqual({ status: "ok", categoryId: "c-paseos", categoryName: "Paseos" });
  });
  it("match por 'incluye' cuando no hay exacto", async () => {
    const r = await resolveCategoryByName("u1", "super", "gasto");
    expect(r).toEqual({ status: "ok", categoryId: "c-super", categoryName: "Supermercado" });
  });
  it("ambiguo → devuelve opciones", async () => {
    const r = await resolveCategoryByName("u1", "comida", "gasto");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.options.sort()).toEqual(["Comida casa", "Comida fuera"]);
  });
  it("respeta la naturaleza: 'Salario' no es válido para un gasto", async () => {
    expect((await resolveCategoryByName("u1", "Salario", "gasto")).status).toBe("none");
    expect((await resolveCategoryByName("u1", "Salario", "ingreso")).status).toBe("ok");
  });
  it("excluye categorías padre (no hoja)", async () => {
    expect((await resolveCategoryByName("u1", "Hogar", "gasto")).status).toBe("none");
  });
  it("sin coincidencia → none", async () => {
    expect((await resolveCategoryByName("u1", "xyz", "gasto")).status).toBe("none");
  });

  it("respeta overrides del hogar: una base OCULTA sin fork no se resuelve", async () => {
    h.members = [{ household_id: "H", role: "owner" }];
    h.overrides = [{ category_id: "c-paseos", hidden: true, fork_id: null }];
    expect((await resolveCategoryByName("u1", "paseos", "gasto")).status).toBe("none");
  });

  it("respeta overrides del hogar: el FORK reemplaza a la base al resolver por nombre", async () => {
    h.cats = [...CATS, cat({ id: "c-paseos-fork", name: "Salidas" })];
    h.members = [{ household_id: "H", role: "owner" }];
    h.overrides = [{ category_id: "c-paseos", hidden: true, fork_id: "c-paseos-fork" }];
    // La base "Paseos" ya no resuelve; su reemplazo "Salidas" sí.
    expect((await resolveCategoryByName("u1", "paseos", "gasto")).status).toBe("none");
    expect(await resolveCategoryByName("u1", "salidas", "gasto")).toEqual({
      status: "ok",
      categoryId: "c-paseos-fork",
      categoryName: "Salidas",
    });
  });
});

// ---------------------------------------------------------------------------
// moveLastTransaction (service-role)
// ---------------------------------------------------------------------------
describe("moveLastTransaction", () => {
  it("re-categoriza la última transacción; sin alsoRule NO toca la regla", async () => {
    h.lastTxn = { id: "t1", merchant_or_source: "Cine Magaly", kind: "gasto" };
    const res = await moveLastTransaction("u1", "Paseos", false);
    expect(res).toEqual({
      status: "ok",
      categoryName: "Paseos",
      merchant: "Cine Magaly",
      ruleUpdated: false,
    });
    const payload = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.category_id).toBe("c-paseos");
    expect(upsertRuleForUser).not.toHaveBeenCalled();
  });

  it("con alsoRule + comercio → upsert de la regla", async () => {
    h.lastTxn = { id: "t1", merchant_or_source: "Cine Magaly", kind: "gasto" };
    const res = await moveLastTransaction("u1", "Paseos", true);
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.ruleUpdated).toBe(true);
    expect(upsertRuleForUser).toHaveBeenCalledWith("u1", "Cine Magaly", "expense", "c-paseos");
  });

  it("sin transacción reciente → no_txn (explicable, no escribe)", async () => {
    h.lastTxn = null;
    const res = await moveLastTransaction("u1", "Paseos", false);
    expect(res.status).toBe("no_txn");
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("sobre inexistente → not_found", async () => {
    h.lastTxn = { id: "t1", merchant_or_source: "X", kind: "gasto" };
    const res = await moveLastTransaction("u1", "xyz", false);
    expect(res.status).toBe("not_found");
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("ambiguo → propaga las opciones, no escribe", async () => {
    h.lastTxn = { id: "t1", merchant_or_source: "X", kind: "gasto" };
    const res = await moveLastTransaction("u1", "comida", false);
    expect(res.status).toBe("ambiguous");
    expect(h.updateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// moveTransaction (por monto) + getTransactionByAmount
// ---------------------------------------------------------------------------
describe("moveTransaction / getTransactionByAmount", () => {
  it("getTransactionByAmount devuelve la transacción con ese monto", async () => {
    h.lastTxn = { id: "t9", merchant_or_source: "Auto Mercado", kind: "gasto" };
    const t = await getTransactionByAmount("u1", 12000);
    expect(t).toEqual({ id: "t9", merchant: "Auto Mercado", kind: "gasto" });
  });

  it("amount null → mueve la última (delegación a getLastTransaction)", async () => {
    h.lastTxn = { id: "t1", merchant_or_source: "Cine", kind: "gasto" };
    const res = await moveTransaction("u1", null, "Paseos", false);
    expect(res.status).toBe("ok");
    const payload = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.category_id).toBe("c-paseos");
  });

  it("con monto → mueve esa transacción; con alsoRule hace upsert", async () => {
    h.lastTxn = { id: "t9", merchant_or_source: "Auto Mercado", kind: "gasto" };
    const res = await moveTransaction("u1", 12000, "Paseos", true);
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.ruleUpdated).toBe(true);
    expect(upsertRuleForUser).toHaveBeenCalledWith("u1", "Auto Mercado", "expense", "c-paseos");
  });

  it("monto sin coincidencia → no_txn con el monto buscado (explicable, no escribe)", async () => {
    h.lastTxn = null;
    const res = await moveTransaction("u1", 99999, "Paseos", false);
    expect(res.status).toBe("no_txn");
    if (res.status === "no_txn") expect(res.amount).toBe(99999);
    expect(h.updateSpy).not.toHaveBeenCalled();
  });
});
