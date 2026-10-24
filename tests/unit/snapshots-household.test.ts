/**
 * Guarda de hogar para `portfolio_snapshots`.
 *
 * Contrato del repo: TODA escritura en una tabla de datos de usuario lleva `household_id`,
 * porque la RLS filtra por él. Una fila sin él es invisible para el resto del hogar — Marta no
 * vería los puntos de patrimonio que sí ve José.
 *
 * Esta escritura se le escapó al guardián que ya existe (`household-propagation.test.ts`)
 * porque no pasa por el orquestador: la hace el cron directamente con el cliente de servicio.
 * Medido en producción antes del arreglo: 16 filas, **4 sin `household_id` ni `created_by`**.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const HOGAR = "hh-patrimonio-1";
let hogarActivo: string | null = HOGAR;

vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: vi.fn(async () => hogarActivo),
}));

/** Lo que se le pasó a `upsert`/`insert` de `portfolio_snapshots`, por llamada. */
const escrito: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(tabla: string) {
      if (tabla !== "portfolio_snapshots") throw new Error(`tabla inesperada: ${tabla}`);
      const fila = {
        id: "s1",
        date: "2026-09-18",
        portfolio_value: 1,
        investment_value: 1,
        net_worth: 1,
        currency: "CRC",
      };
      return {
        upsert(payload: Record<string, unknown>) {
          escrito.push(payload);
          return {
            select: () => ({ maybeSingle: async () => ({ data: fila, error: null }) }),
          };
        },
        insert: async (payload: Record<string, unknown>) => {
          escrito.push(payload);
          return { error: null };
        },
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/time/clock", () => ({ now: () => new Date("2026-09-18T18:00:00Z") }));

const { generateAndSaveSnapshot, maybeGenerateSnapshot } = await import(
  "@/modules/wealth/services/snapshot-service"
);

beforeEach(() => {
  escrito.length = 0;
  hogarActivo = HOGAR;
});

describe("portfolio_snapshots", () => {
  it("el snapshot del cron lleva household_id y created_by", async () => {
    await generateAndSaveSnapshot("user-1", 100, 90, 500, "CRC");
    expect(escrito).toHaveLength(1);
    expect(escrito[0]).toMatchObject({
      user_id: "user-1",
      household_id: HOGAR,
      created_by: "user-1",
    });
  });

  it("el de la carga de pantalla también", async () => {
    await maybeGenerateSnapshot("user-2", 100, 90, 500, "CRC");
    expect(escrito).toHaveLength(1);
    expect(escrito[0]).toMatchObject({
      user_id: "user-2",
      household_id: HOGAR,
      created_by: "user-2",
    });
  });

  it("sin hogar la fila se escribe igual, con household_id nulo", async () => {
    // Modo «solo»: el usuario no pertenece a ningún hogar. La fila tiene que existir —es SU
    // patrimonio— y `created_by` sigue diciendo quién la escribió. Poner un hogar inventado
    // sería peor que no poner ninguno.
    hogarActivo = null;
    await generateAndSaveSnapshot("user-3", 100, 90, 500, "CRC");
    expect(escrito[0]).toMatchObject({ user_id: "user-3", household_id: null, created_by: "user-3" });
  });
});
