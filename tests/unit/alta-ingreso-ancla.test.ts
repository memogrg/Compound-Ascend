/**
 * EL BUG: crear un ingreso bimestral anclado en OCTUBRE, estando en SEPTIEMBRE,
 * escribía igual la línea de septiembre. `registerIncomeSource` insertaba en el
 * periodo de `occurredOn` sin mirar nunca la agenda; el ancla quedaba bien en la
 * plantilla, pero el alta ya había escrito el mes equivocado.
 *
 * Estos tests fijan las tres piezas del arreglo: no se crea línea fuera de fase,
 * la plantilla SÍ se crea (la fuente existe), y el alta dice para cuándo quedó
 * agendada — sin ese aviso parece que falló y la persona la crea otra vez.
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
let plantillasInsertadas: Fila[] = [];
let lineasInsertadas: Fila[] = [];
let lineasExistentes: Fila[] = [];

function tabla(rows: Fila[], onInsert?: (p: Fila) => void, nuevoId = "id-nuevo") {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "in", "neq", "order", "limit"]) q[m] = chain;
  q.insert = (payload: Fila) => {
    onInsert?.(payload);
    return {
      select: () => ({ single: async () => ({ data: { id: nuevoId }, error: null }) }),
    };
  };
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  return q;
}

const db = () => ({
  from(t: string) {
    if (t === "recurring_items") return tabla([], (p) => plantillasInsertadas.push(p), "tpl-1");
    if (t === "budget_items")
      return tabla(lineasExistentes, (p) => lineasInsertadas.push(p), "line-1");
    return tabla([]);
  },
});

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => db()) }));
vi.mock("@/lib/auth/auth-context", () => ({
  resolveAuth: vi.fn(async (ctx?: { db?: unknown; userId?: string }) => ({
    db: ctx?.db ?? db(),
    userId: ctx?.userId ?? "user-1",
  })),
}));

import { registerIncomeSource } from "@/modules/financial-base/services/budget-service";

/** Alta en SEPTIEMBRE (occurredOn) con el ancla que se le pase. */
const alta = (over: Record<string, unknown> = {}) =>
  registerIncomeSource({
    name: "Aguinaldo",
    amount: 100,
    currency: "USD",
    occurredOn: "2026-09-15",
    incomeType: "activo" as const,
    recurrent: true,
    frequency: "bimensual" as const,
    nextDate: "2026-10-01",
    categoryId: null,
    ...over,
  } as Parameters<typeof registerIncomeSource>[0]);

beforeEach(() => {
  plantillasInsertadas = [];
  lineasInsertadas = [];
  lineasExistentes = [];
});

describe("alta en septiembre con ancla en octubre", () => {
  it("NO crea línea en septiembre", async () => {
    const res = await alta();
    expect(lineasInsertadas).toHaveLength(0);
    expect(res.budgetItemId).toBeNull();
  });

  it("SÍ crea la plantilla, con el ancla guardada", async () => {
    await alta();
    expect(plantillasInsertadas).toHaveLength(1);
    expect(plantillasInsertadas[0]).toMatchObject({
      kind: "ingreso",
      frequency: "bimensual",
      next_date: "2026-10-01",
    });
  });

  it("dice para cuándo quedó agendada — y es OCTUBRE, no noviembre", async () => {
    const res = await alta();
    expect(res.agendadoPara).toEqual({ year: 2026, month: 10 });
  });
});

describe("alta que SÍ cae en el mes", () => {
  it("bimestral anclada en septiembre crea la línea de septiembre", async () => {
    const res = await alta({ nextDate: "2026-09-01" });
    expect(lineasInsertadas).toHaveLength(1);
    expect(lineasInsertadas[0]).toMatchObject({
      type: "income",
      period_year: 2026,
      period_month: 9,
      frequency: "bimensual",
    });
    expect(res.budgetItemId).toBe("line-1");
    expect(res.agendadoPara).toBeNull();
  });

  it("una mensual no se agenda a futuro nunca: cae en el mes del alta", async () => {
    const res = await alta({ frequency: "mensual", nextDate: null });
    expect(lineasInsertadas).toHaveLength(1);
    expect(res.agendadoPara).toBeNull();
  });

  it("una NO recurrente cae en su mes aunque le pasen ancla", async () => {
    // Sin recurrencia no hay agenda que respetar: es un ingreso de ese mes.
    const res = await alta({ recurrent: false, nextDate: "2026-12-01" });
    expect(lineasInsertadas).toHaveLength(1);
    expect(lineasInsertadas[0]).toMatchObject({ frequency: "mensual", period_month: 9 });
    expect(res.agendadoPara).toBeNull();
  });

  it("multi-mes SIN ancla cae en el mes del alta (heredadas: no desaparecen)", async () => {
    const res = await alta({ nextDate: null });
    expect(lineasInsertadas).toHaveLength(1);
    expect(res.agendadoPara).toBeNull();
  });
});

describe("frecuencias sin agenda", () => {
  it("'unico' recurrente no se traga la línea: la crea igual", async () => {
    // `caeEnElPeriodo` devuelve false para 'unico'. Si la compuerta no filtrara
    // por requiereAncla, esta fuente no crearía línea ni acá ni en
    // ensureRecurringIncome, y desaparecería en silencio.
    const res = await alta({ frequency: "unico", nextDate: null });
    expect(lineasInsertadas).toHaveLength(1);
    expect(res.agendadoPara).toBeNull();
  });
});
