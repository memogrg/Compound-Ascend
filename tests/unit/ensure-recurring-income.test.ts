/**
 * Contrato de la AGENDA DE COBROS (`ensureRecurringIncome`).
 *
 * Es la función de las DOS PUERTAS: el page load de la Base y el cron diario de
 * `ventana`. De lo que materialice sale el presupuesto del mes, y de ese
 * presupuesto salen los indicadores (score de salud, DTI, contexto del asesor),
 * así que tres cosas no se pueden romper en silencio:
 *
 *  1. Respeta el ancla: un bimestral sólo se agenda en SUS meses.
 *  2. Es idempotente: correrla dos veces (las dos puertas, o el botón) no duplica.
 *  3. Acepta ctx inyectado: sin él corre con la sesión; con él, el cron le pasa
 *     service-role + userId. Si esto se rompe, el cron deja de ser una puerta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: vi.fn(async () => "hh-1"),
  householdMemberIds: vi.fn(async (_c: unknown, uid: string) => [uid]),
  householdWriteScope: vi.fn(async (_c: unknown, uid: string) => [uid]),
}));
vi.mock("@/lib/household/activity-log", () => ({ logHouseholdDeletion: vi.fn(async () => {}) }));

type Fila = Record<string, unknown>;

/** Estado de la "BD" del test. */
let plantillas: Fila[] = [];
let lineas: Fila[] = [];
let insertados: Fila[] = [];

/**
 * Query builder mínimo: encadena y al await devuelve las filas de la tabla.
 * Los filtros no se aplican salvo los que el test necesita distinguir
 * (type/kind), porque lo que se está probando es la SELECCIÓN por ancla, no el
 * armado del where.
 */
function tabla(rows: Fila[], onInsert?: (p: Fila) => void) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "in", "neq", "order", "gte", "lte", "limit"]) q[m] = chain;
  q.insert = (payload: Fila) => {
    onInsert?.(payload);
    return { select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) };
  };
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  return q;
}

function db() {
  return {
    from(t: string) {
      if (t === "recurring_items") return tabla(plantillas);
      if (t === "budget_items") return tabla(lineas, (p) => insertados.push(p));
      return tabla([]);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => db()) }));
vi.mock("@/lib/auth/auth-context", () => ({
  resolveAuth: vi.fn(async (ctx?: { db?: unknown; userId?: string }) => ({
    db: ctx?.db ?? db(),
    userId: ctx?.userId ?? "user-1",
  })),
}));

import { ensureRecurringIncome } from "@/modules/financial-base/services/budget-service";

const periodo = (year: number, month: number) => ({
  year,
  month,
  from: `${year}-${String(month).padStart(2, "0")}-01`,
  to: `${year}-${String(month).padStart(2, "0")}-28`,
  label: `${year}-${month}`,
});

const plantilla = (over: Partial<Fila> = {}): Fila => ({
  id: "t1",
  name: "Aguinaldo",
  amount: 500000,
  currency: "CRC",
  frequency: "bimensual",
  next_date: "2026-01-01",
  ...over,
});

beforeEach(() => {
  plantillas = [];
  lineas = [];
  insertados = [];
});

describe("ensureRecurringIncome · respeta el ancla", () => {
  it("un bimestral anclado en enero se agenda en enero", async () => {
    plantillas = [plantilla()];
    expect(await ensureRecurringIncome(periodo(2026, 1))).toBe(1);
    expect(insertados).toHaveLength(1);
    expect(insertados[0]).toMatchObject({ type: "income", amount: 500000, frequency: "bimensual" });
  });

  it("y NO en febrero", async () => {
    plantillas = [plantilla()];
    expect(await ensureRecurringIncome(periodo(2026, 2))).toBe(0);
    expect(insertados).toHaveLength(0);
  });

  it("vuelve a caer en marzo (la fase se mantiene)", async () => {
    plantillas = [plantilla()];
    expect(await ensureRecurringIncome(periodo(2026, 3))).toBe(1);
  });

  it("una mensual cae todos los meses", async () => {
    plantillas = [plantilla({ frequency: "mensual", next_date: null })];
    expect(await ensureRecurringIncome(periodo(2026, 2))).toBe(1);
    insertados = [];
    expect(await ensureRecurringIncome(periodo(2026, 3))).toBe(1);
  });

  it("no se agenda antes del primer pago", async () => {
    plantillas = [plantilla({ next_date: "2026-06-01" })];
    expect(await ensureRecurringIncome(periodo(2026, 2))).toBe(0);
  });
});

describe("ensureRecurringIncome · idempotencia (las dos puertas y el botón)", () => {
  it("si la plantilla ya tiene línea este mes, no la duplica", async () => {
    plantillas = [plantilla({ frequency: "mensual", next_date: null })];
    lineas = [{ id: "b1", type: "income", recurring_item_id: "t1", amount: 500000 }];
    expect(await ensureRecurringIncome(periodo(2026, 2))).toBe(0);
    expect(insertados).toHaveLength(0);
  });

  it("sin plantillas no escribe nada", async () => {
    expect(await ensureRecurringIncome(periodo(2026, 2))).toBe(0);
    expect(insertados).toHaveLength(0);
  });
});

describe("ensureRecurringIncome · ctx inyectado (la puerta del cron)", () => {
  it("usa el cliente y el userId que le pasan, sin tocar la sesión", async () => {
    plantillas = [plantilla({ frequency: "mensual", next_date: null })];
    const { requireUser } = await import("@/lib/auth/session");

    // El stub no implementa SupabaseClient entero; sólo lo que la función usa.
    const n = await ensureRecurringIncome(periodo(2026, 4), {
      db: db() as never,
      userId: "otro-user",
    });

    expect(n).toBe(1);
    // Si esto se rompe, el cron deja de poder correr por el usuario y vuelve a
    // haber una sola puerta.
    expect(requireUser).not.toHaveBeenCalled();
  });
});
