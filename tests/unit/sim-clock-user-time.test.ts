import { describe, expect, it } from "vitest";

import { withSimClock } from "@/lib/time/clock";
import { userCurrentPeriod, userHour, userToday } from "@/lib/time/user-time";

/**
 * Seam del reloj virtual en la capa de tiempo del usuario: bajo `withSimClock`, los wrappers
 * server-side devuelven el periodo/día/hora VIRTUALES; sin reloj, el real. En el runner (sin
 * request ni sesión) la zona cae a "UTC" — `cookies()`/`requireUser()` lanzan y se atrapan —,
 * así que estos asertos son deterministas en UTC.
 */
describe("wrappers de tiempo bajo reloj virtual", () => {
  it("userCurrentPeriod devuelve el periodo del mes VIRTUAL", async () => {
    const p = await withSimClock(new Date("2026-03-15T12:00:00Z"), () => userCurrentPeriod());
    expect(p).toMatchObject({ year: 2026, month: 3 });
  });

  it("cruzar un límite de mes cambia el periodo (UTC)", async () => {
    const mar = await withSimClock(new Date("2026-03-31T23:00:00Z"), () => userCurrentPeriod());
    const apr = await withSimClock(new Date("2026-04-01T00:30:00Z"), () => userCurrentPeriod());
    expect(mar.month).toBe(3);
    expect(apr.month).toBe(4);
  });

  it("userToday y userHour siguen el reloj virtual", async () => {
    const at = new Date("2026-03-15T09:00:00Z");
    expect(await withSimClock(at, () => userToday())).toBe("2026-03-15");
    expect(await withSimClock(at, () => userHour())).toBe(9);
  });

  it("DCA seam: avanzar un mes cambia el periodo (mes+1); mismo mes = misma clave (idempotente)", async () => {
    // Es el mecanismo del que depende ensureMonthlyContributions: la clave única
    // (holding_id, period_year, period_month) sale de userCurrentPeriod(). Si el reloj no
    // avanzara aquí, el DCA quedaría congelado tras el primer mes.
    const mar1 = await withSimClock(new Date("2026-03-10T12:00:00Z"), () => userCurrentPeriod());
    const mar2 = await withSimClock(new Date("2026-03-20T12:00:00Z"), () => userCurrentPeriod());
    const apr = await withSimClock(new Date("2026-04-10T12:00:00Z"), () => userCurrentPeriod());
    expect([mar1.year, mar1.month]).toEqual([2026, 3]);
    expect([mar2.year, mar2.month]).toEqual([2026, 3]); // mismo mes virtual → clave idéntica
    expect([apr.year, apr.month]).toEqual([2026, 4]); // mes avanzado → nueva clave → DCA avanza
  });

  it("sin reloj activo: el comportamiento actual no cambia (día real en UTC)", async () => {
    expect(await userToday()).toBe(new Date().toISOString().slice(0, 10));
  });
});
