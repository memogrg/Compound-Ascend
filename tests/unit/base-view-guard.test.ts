/**
 * El guard de `loadBaseView`: una LECTURA no escribe presupuesto de meses pasados.
 *
 * No se ejecuta `loadBaseView` hasta el final —hace veinte consultas después del guard—
 * sino solo lo justo para pasar (o no) por él: la llamada va envuelta en `try/catch` y lo
 * que se afirma es el **spy** de `syncDerivedBudget`. Si el guard desapareciera, el spy se
 * llamaría con el mes pasado aunque el resto reventara después.
 *
 * La fuente de verdad del "mes actual" es `userCurrentPeriod()`, que resuelve la zona del
 * USUARIO — nunca `new Date()` del servidor, que en Vercel es UTC. Por eso se mockea ese
 * helper y no el reloj: es exactamente el contrato que el guard debe respetar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { monthPeriod } from "@/modules/financial-base/engine/period";
import type { Period } from "@/modules/financial-base/types";

const ACTUAL = monthPeriod(2026, 9);

// Tipados: un `vi.fn(async () => {})` infiere CERO parámetros y luego `mock.calls[0][0]`
// no compila. La firma va explícita para poder afirmar con qué periodo se llamó.
const syncDerivedBudget = vi.fn<(p: Period) => Promise<void>>(async () => {});
const ensureRecurringIncome = vi.fn<(p: Period) => Promise<void>>(async () => {});
const userCurrentPeriod = vi.fn<() => Promise<Period>>(async () => ACTUAL);

vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/time/user-time", () => ({ userCurrentPeriod: () => userCurrentPeriod() }));
vi.mock("@/modules/financial-base/services/derived-budget-service", () => ({
  syncDerivedBudget: (p: Period) => syncDerivedBudget(p),
}));
vi.mock("@/modules/financial-base/services/budget-service", () => ({
  ensureRecurringIncome: (p: Period) => ensureRecurringIncome(p),
  getBudgetTotals: async () => {
    throw new Error("corte: el test solo mira hasta el guard");
  },
}));

async function cargar(periodRaw: string | undefined) {
  const { loadBaseView } = await import("@/modules/financial-base/services/base-view");
  // Revienta después del guard, a propósito: lo que importa ya quedó registrado en el spy.
  try {
    await loadBaseView(periodRaw);
  } catch {
    /* esperado */
  }
}

describe("loadBaseView · guard de escritura", () => {
  beforeEach(() => {
    syncDerivedBudget.mockClear();
    ensureRecurringIncome.mockClear();
  });

  it("mes PASADO → no sincroniza (cero escrituras de presupuesto)", async () => {
    await cargar("2026-05");
    expect(syncDerivedBudget).not.toHaveBeenCalled();
  });

  it("mes EN CURSO → sincroniza, como antes", async () => {
    await cargar("2026-09");
    expect(syncDerivedBudget).toHaveBeenCalledTimes(1);
    expect(syncDerivedBudget.mock.calls[0]?.[0]).toMatchObject({ year: 2026, month: 9 });
  });

  it("mes FUTURO → sincroniza: un presupuesto por venir todavía se planifica", async () => {
    await cargar("2026-11");
    expect(syncDerivedBudget).toHaveBeenCalledTimes(1);
    expect(syncDerivedBudget.mock.calls[0]?.[0]).toMatchObject({ year: 2026, month: 11 });
  });

  it("sin ?period= (cae al mes del usuario) → sincroniza", async () => {
    await cargar(undefined);
    expect(syncDerivedBudget).toHaveBeenCalledTimes(1);
  });

  it("el mes anterior inmediato tampoco sincroniza (el borde)", async () => {
    await cargar("2026-08");
    expect(syncDerivedBudget).not.toHaveBeenCalled();
  });

  it("cruce de año: dic 2025 con el usuario en sep 2026 → no sincroniza", async () => {
    await cargar("2025-12");
    expect(syncDerivedBudget).not.toHaveBeenCalled();
  });
});

describe("el borde de mes sigue al USUARIO, no al reloj del servidor", () => {
  beforeEach(() => {
    syncDerivedBudget.mockClear();
  });

  it("con el servidor ya en octubre UTC, septiembre sigue siendo el mes en curso", async () => {
    // 30 de septiembre 23:30 UTC = 17:30 en Costa Rica: para el usuario todavía es
    // septiembre. Si el guard mirara `new Date()` del servidor (UTC), a las 00:30 del 1-oct
    // pasaría a considerar septiembre "pasado" y dejaría de sincronizar el mes que la
    // persona está viviendo.
    // No se espía `Date`: el guard no lo consulta, y hacerlo rompería `monthPeriod`, que sí
    // lo usa para calcular el último día del mes. Lo que fija el contrato es de dónde sale
    // el mes actual — `userCurrentPeriod()` —, y eso es lo que se controla acá.
    userCurrentPeriod.mockResolvedValueOnce(monthPeriod(2026, 9));
    await cargar("2026-09");
    expect(syncDerivedBudget).toHaveBeenCalledTimes(1);
  });

  it("y si el usuario YA pasó a octubre, septiembre es pasado y no se sincroniza", async () => {
    userCurrentPeriod.mockResolvedValueOnce(monthPeriod(2026, 10));
    await cargar("2026-09");
    expect(syncDerivedBudget).not.toHaveBeenCalled();
  });
});
