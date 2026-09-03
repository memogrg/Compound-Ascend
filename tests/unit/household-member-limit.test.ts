/**
 * Límite de miembros del hogar por plan (tabla en lib/plan). Es una tabla para
 * que mover un tier sea una línea; el test fija el contrato actual.
 */
import { describe, it, expect } from "vitest";
import { householdMemberLimit, HOUSEHOLD_MEMBER_LIMITS } from "@/lib/plan";

describe("householdMemberLimit", () => {
  it("solo Max+ es plan de hogar: 1 / 1 / 3 (total, incluido el titular)", () => {
    expect(householdMemberLimit("ninguno")).toBe(1);
    expect(householdMemberLimit("esencial")).toBe(1);
    expect(householdMemberLimit("pro")).toBe(1);
    expect(householdMemberLimit("max")).toBe(3);
  });

  it("el titular siempre cabe en su propio plan", () => {
    for (const limit of Object.values(HOUSEHOLD_MEMBER_LIMITS)) {
      expect(limit).toBeGreaterThanOrEqual(1);
    }
  });

  it("bajar de Max+ deja el hogar sin espacio: por eso existe la orfandad", () => {
    expect(householdMemberLimit("pro")).toBeLessThan(householdMemberLimit("max"));
  });
});

/**
 * Reglas de cupo/sobre-límite que la UI y el servidor comparten (lógica pura):
 * el "usado" cuenta ACTIVOS + PENDIENTES; sobre-límite no bloquea a los actuales.
 */
describe("cupo del hogar (activos + pendientes)", () => {
  const remaining = (limit: number, active: number, pending: number) =>
    Math.max(0, limit - active - pending);
  const overLimit = (limit: number, active: number, pending: number) => active + pending > limit;

  it("Max+ con 1 activo → quedan 2 cupos", () => {
    expect(remaining(3, 1, 0)).toBe(2);
    expect(overLimit(3, 1, 0)).toBe(false);
  });

  it("las PENDIENTES ocupan cupo (no se invita de más)", () => {
    expect(remaining(3, 2, 1)).toBe(0);
    expect(overLimit(3, 2, 1)).toBe(false);
  });

  it("sobre-límite → 0 cupos y overLimit, sin números negativos", () => {
    expect(remaining(3, 4, 0)).toBe(0);
    expect(overLimit(3, 4, 0)).toBe(true);
  });
});
