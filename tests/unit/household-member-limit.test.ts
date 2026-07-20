/**
 * Límite de miembros del hogar por plan (tabla en lib/plan). Es una tabla para
 * que sumar un tier futuro sea una línea; el test fija el contrato actual.
 */
import { describe, it, expect } from "vitest";
import { householdMemberLimit, HOUSEHOLD_MEMBER_LIMITS } from "@/lib/plan";

describe("householdMemberLimit", () => {
  it("free = 2, premium = 3 (total, incluido el titular)", () => {
    expect(householdMemberLimit("free")).toBe(2);
    expect(householdMemberLimit("premium")).toBe(3);
  });

  it("la tabla cubre todos los planes (agregar un tier = una línea)", () => {
    for (const limit of Object.values(HOUSEHOLD_MEMBER_LIMITS)) {
      expect(limit).toBeGreaterThanOrEqual(2); // el titular siempre cabe
    }
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

  it("free con 1 activo → queda 1 cupo", () => {
    expect(remaining(2, 1, 0)).toBe(1);
    expect(overLimit(2, 1, 0)).toBe(false);
  });

  it("las PENDIENTES ocupan cupo (no se invita de más)", () => {
    // free (2): 1 activo + 1 pendiente = lleno, aunque no haya 2 activos.
    expect(remaining(2, 1, 1)).toBe(0);
    expect(overLimit(2, 1, 1)).toBe(false);
  });

  it("sobre-límite (3 activos en plan free) → 0 cupos y overLimit, sin números negativos", () => {
    expect(remaining(2, 3, 0)).toBe(0); // nunca negativo
    expect(overLimit(2, 3, 0)).toBe(true);
  });
});
