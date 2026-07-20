/**
 * Regresión del bug de edición compartida en la ruta vinculada (prueba en vivo):
 * gastar de un sobre / aportar a una meta / pagar una deuda de OTRO miembro
 * fallaba porque assertLinkableEntity —el guardia que valida la entidad de toda
 * transacción vinculada— seguía acotado por user_id. spendFromGoal pasaba (bien
 * scopeado) pero este guardia no encontraba la entidad y tiraba "no te pertenece".
 *
 * El guardia es de ESCRITURA (autoriza vincular = propagar al ledger de la
 * entidad), así que debe usar householdWriteScope: un editor sobre cualquier
 * entidad del hogar; un no-editor solo la suya, con mensaje claro si la fila es
 * del hogar pero no la puede editar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "B" }) }));

// Estado configurable del hogar y de la fila objetivo.
const h = vi.hoisted(() => ({
  writeScope: ["B"] as string[], // householdWriteScope: editor→[A,B], viewer→[B]
  rowInScope: null as { id: string } | null, // qué devuelve el SELECT scopeado
  existsInHh: false, // ¿la entidad existe en el hogar (aunque fuera de scope)?
}));

vi.mock("@/lib/household/active", () => ({
  householdMemberIds: async () => ["A", "B"],
  householdWriteScope: async () => h.writeScope,
  existsInHousehold: async () => h.existsInHh,
  HOUSEHOLD_READ_ONLY_MESSAGE: "SOLO_LECTURA",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        in: () => q,
        maybeSingle: async () => ({ data: h.rowInScope, error: null }),
      };
      return q;
    },
  }),
}));

import {
  assertLinkableEntity,
  LINKED_KIND_MISSING_MSG,
} from "@/modules/financial-base/services/linkable-entities-service";

beforeEach(() => {
  h.writeScope = ["B"];
  h.rowInScope = null;
  h.existsInHh = false;
});

describe("assertLinkableEntity · edición compartida", () => {
  it("editor (B, adult) sobre la meta de A → autoriza (la halla en su write-scope)", async () => {
    h.writeScope = ["A", "B"]; // B es editor
    h.rowInScope = { id: "goalA" }; // el SELECT scopeado la encuentra
    await expect(assertLinkableEntity("goal", "goalA")).resolves.toBeUndefined();
  });

  it("editor sobre la deuda de A → autoriza (misma cadena: pago de deuda)", async () => {
    h.writeScope = ["A", "B"];
    h.rowInScope = { id: "debtA" };
    await expect(assertLinkableEntity("debt", "debtA")).resolves.toBeUndefined();
  });

  it("no-editor (viewer) sobre la meta de A → mensaje de solo-lectura, no el genérico", async () => {
    h.writeScope = ["B"]; // viewer: scope = solo el propio
    h.rowInScope = null; // no está en su write-scope
    h.existsInHh = true; // pero SÍ existe en el hogar
    await expect(assertLinkableEntity("goal", "goalA")).rejects.toThrow("SOLO_LECTURA");
  });

  it("entidad inexistente (ni en scope ni en hogar) → mensaje genérico por tipo", async () => {
    h.writeScope = ["A", "B"];
    h.rowInScope = null;
    h.existsInHh = false;
    await expect(assertLinkableEntity("goal", "fantasma")).rejects.toThrow(
      LINKED_KIND_MISSING_MSG.goal,
    );
  });

  it("cualquiera sobre su propia entidad → autoriza (rama user_id de siempre)", async () => {
    h.writeScope = ["B"]; // incluso viewer, su propia meta está en scope
    h.rowInScope = { id: "goalB" };
    await expect(assertLinkableEntity("goal", "goalB")).resolves.toBeUndefined();
  });
});
