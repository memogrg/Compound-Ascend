/**
 * `syncDerivedBudget` desde el CRON: sin sesión, y sin tocar un mes cerrado.
 *
 * Las dos mitades del plan 15. Hoy las líneas derivadas de un mes solo existen si su dueño
 * abrió la app durante ese mes (`base-view` las sincroniza al cargar, y solo si el periodo no
 * es anterior al actual), así que el histórico de quien no la abrió tiene un escalón: le falta
 * la parte derivada del presupuesto. Para cerrarlo hace falta que el cron pueda materializarlas
 * por todos, y para eso la función tiene que dejar de pedir `requireUser()`.
 *
 * El stub de Supabase es deliberadamente tonto —encadena y devuelve lo que se le dijo— porque
 * lo que se prueba no es SQL: es que el camino sin sesión llegue al final, y que con
 * `congelado` no salga ni un UPDATE ni un DELETE. Esas dos son condiciones de parada escritas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/** Si el camino de cron toca la sesión, revienta acá y el caso lo dice con nombre. */
const requireUserMock = vi.fn(async () => {
  throw new Error("requireUser: el camino de cron NO puede pedir sesión");
});
vi.mock("@/lib/auth/session", () => ({
  requireUser: () => requireUserMock(),
  getUser: vi.fn(),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    throw new Error("createSupabaseServerClient: el camino de cron usa su propio cliente");
  },
}));

type Escritura = { op: "insert" | "update" | "delete"; tabla: string };

/** Filas por tabla; lo que no esté aquí devuelve []. */
function stubDb(filas: Record<string, unknown[]>, escrituras: Escritura[]) {
  const q = (tabla: string) => {
    const thenable = {
      select: () => thenable,
      eq: () => thenable,
      neq: () => thenable,
      in: () => thenable,
      gte: () => thenable,
      lte: () => thenable,
      lt: () => thenable,
      gt: () => thenable,
      not: () => thenable,
      or: () => thenable,
      is: () => thenable,
      order: () => thenable,
      limit: () => thenable,
      ilike: () => thenable,
      maybeSingle: async () => ({ data: (filas[tabla] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (filas[tabla] ?? [])[0] ?? null, error: null }),
      insert: () => {
        escrituras.push({ op: "insert", tabla });
        return thenable;
      },
      update: () => {
        escrituras.push({ op: "update", tabla });
        return thenable;
      },
      delete: () => {
        escrituras.push({ op: "delete", tabla });
        return thenable;
      },
      then: (
        resolve: (v: { data: unknown[]; error: null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve({ data: filas[tabla] ?? [], error: null }).then(resolve, reject),
    };
    return thenable;
  };
  return { from: (tabla: string) => q(tabla) } as never;
}

const PERIODO_CERRADO = {
  year: 2026,
  month: 8,
  label: "2026-08",
  from: "2026-08-01",
  to: "2026-08-31",
};

beforeEach(() => {
  // OJO con las llaves: `beforeEach(() => fn.mockClear())` devuelve la propia mock, y vitest
  // toma lo que devuelve un hook como su función de limpieza. La llamaba al terminar el caso,
  // y el spec fallaba con «el camino de cron NO puede pedir sesión» apuntando al código.
  requireUserMock.mockClear();
});

describe("syncDerivedBudget con ctx (cron)", () => {
  it("no pide sesión: llega al final con el cliente inyectado", async () => {
    const escrituras: Escritura[] = [];
    const { syncDerivedBudget } =
      await import("@/modules/financial-base/services/derived-budget-service");
    await syncDerivedBudget(PERIODO_CERRADO, {
      db: stubDb({}, escrituras),
      userId: "11111111-1111-1111-1111-111111111111",
    });
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("congelado: con el periodo YA poblado no sale ningún UPDATE ni DELETE", async () => {
    // Una línea derivada que existe con un importe viejo, y ninguna entidad que la respalde:
    // sin `congelado` el diff la borraría (y con importes nuevos, la reescribiría). Un mes
    // cerrado no se reescribe con los números de hoy.
    const escrituras: Escritura[] = [];
    const { syncDerivedBudget } =
      await import("@/modules/financial-base/services/derived-budget-service");
    await syncDerivedBudget(
      PERIODO_CERRADO,
      {
        db: stubDb(
          {
            budget_items: [
              {
                id: "bi-1",
                type: "expense",
                name: "Pago — Hipoteca",
                amount: 300000,
                currency: "CRC",
                category_id: null,
                source_kind: "debt",
                source_id: "d-1",
              },
            ],
          },
          escrituras,
        ),
        userId: "11111111-1111-1111-1111-111111111111",
      },
      { congelado: true },
    );
    expect(escrituras.filter((e) => e.op !== "insert")).toEqual([]);
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("simulacro: CERO escrituras, y dice cuántas líneas insertaría y de qué origen", async () => {
    // El modo que usa `x-dry-run: 1` contra producción. Un simulacro que escribe no es un
    // simulacro, así que el caso mira TODAS las escrituras, no solo las de `budget_items`.
    const escrituras: Escritura[] = [];
    const { syncDerivedBudget } =
      await import("@/modules/financial-base/services/derived-budget-service");
    const resumen = await syncDerivedBudget(
      PERIODO_CERRADO,
      {
        db: stubDb(
          {
            // Un mes cerrado VACÍO de derivadas y una deuda viva: es el caso que el cron
            // viene a arreglar, así que el simulacro tiene que contar una línea.
            debts: [
              {
                id: "d-1",
                name: "Préstamo",
                currency: "CRC",
                min_payment: 50_000,
                current_payment: 0,
                is_current: true,
                balance: 1_000_000,
              },
            ],
          },
          escrituras,
        ),
        userId: "11111111-1111-1111-1111-111111111111",
      },
      { congelado: true, simulacro: true },
    );
    expect(escrituras).toEqual([]);
    expect(resumen.toInsert).toBe(1);
    expect(resumen.porOrigen).toEqual({ debt: 1 });
  });

  it("SIN congelado, ese mismo mes poblado sí se recorta (el contraste)", async () => {
    // El caso espejo: es lo que hace hoy la carga de pantalla, y es correcto para el mes en
    // curso. Si este dejara de borrar, el de arriba no probaría nada.
    const escrituras: Escritura[] = [];
    const { syncDerivedBudget } =
      await import("@/modules/financial-base/services/derived-budget-service");
    await syncDerivedBudget(PERIODO_CERRADO, {
      db: stubDb(
        {
          budget_items: [
            {
              id: "bi-1",
              type: "expense",
              name: "Pago — Hipoteca",
              amount: 300000,
              currency: "CRC",
              category_id: null,
              source_kind: "debt",
              source_id: "d-1",
            },
          ],
        },
        escrituras,
      ),
      userId: "11111111-1111-1111-1111-111111111111",
    });
    expect(escrituras.some((e) => e.op === "delete" && e.tabla === "budget_items")).toBe(true);
  });
});
