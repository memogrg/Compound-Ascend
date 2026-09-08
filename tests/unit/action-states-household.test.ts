/**
 * Guardia de household × "Mis acciones".
 *
 * La RLS de `user_action_states` es PERSONAL (decidir "ya la hice" es de quien la hizo), pero la
 * fila igual se etiqueta al hogar activo como todo dato de usuario: es la convención que el
 * resto de la app asume, y sin ella una migración futura que abra la lectura al hogar heredaría
 * filas huérfanas. Este test falla si alguien quita household_id del upsert.
 *
 * Hermano de tests/unit/household-propagation.test.ts, que vigila lo mismo en el orquestador.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const HOUSEHOLD = "hh-acciones-1";
let activeHousehold: string | null = HOUSEHOLD;

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: vi.fn(async () => activeHousehold),
}));
vi.mock("@/lib/revalidation/rutas-espejo", () => ({
  revalidarRutas: vi.fn(),
  revalidarRuta: vi.fn(),
}));
vi.mock("@/lib/insights", () => ({ dismissInsight: vi.fn(async () => {}) }));

const upserted: Record<string, unknown[]> = {};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from(table: string) {
      return {
        upsert: async (payload: unknown) => {
          (upserted[table] ??= []).push(payload);
          return { error: null };
        },
      };
    },
  })),
}));

import { markActionDone, snoozeAction } from "@/modules/actions/api/actions";

beforeEach(() => {
  for (const k of Object.keys(upserted)) delete upserted[k];
  activeHousehold = HOUSEHOLD;
});

describe("user_action_states × household", () => {
  it("el upsert lleva household_id cuando hay hogar activo", async () => {
    const res = await markActionDone("surplus:deuda:2026-09", {
      kind: "monto",
      value: 640_000,
      currency: "CRC",
      label: "₡640.000 de interés que no pagás",
    });
    expect(res.ok).toBe(true);
    const fila = upserted["user_action_states"]?.[0] as Record<string, unknown>;
    expect(fila?.household_id).toBe(HOUSEHOLD);
    expect(fila?.user_id).toBe("user-1");
    expect(fila?.status).toBe("hecha");
    // El impacto se congela en la fila: el motor deja de emitir la acción justo porque se hizo.
    expect(fila?.impact).toMatchObject({ kind: "monto", value: 640_000 });
  });

  it("en modo solo (sin hogar) el household_id va null, no se inventa", async () => {
    activeHousehold = null;
    await snoozeAction("insight:orden:cat-1", "2026-09-15");
    const fila = upserted["user_action_states"]?.[0] as Record<string, unknown>;
    expect(fila?.household_id).toBeNull();
    expect(fila?.snooze_until).toBe("2026-09-15");
  });

  it("una clave o fecha inválida no escribe nada", async () => {
    expect((await markActionDone("x")).ok).toBe(false);
    expect((await snoozeAction("insight:orden:cat-1", "15/09/2026")).ok).toBe(false);
    expect(upserted["user_action_states"]).toBeUndefined();
  });
});
