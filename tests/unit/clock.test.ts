import { describe, expect, it } from "vitest";

import { isSimClockActive, now, withSimClock } from "@/lib/time/clock";

/**
 * Reloj virtual por AsyncLocalStorage. Sin store activo, `now()` es `new Date()` (prod
 * idéntico); dentro de `withSimClock` es el instante virtual, y propaga por `await`.
 */
describe("clock · reloj virtual (ALS)", () => {
  it("sin reloj: isSimClockActive()=false y now()≈new Date()", () => {
    expect(isSimClockActive()).toBe(false);
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("withSimClock fija now() al instante virtual y lo restaura al salir", () => {
    const at = new Date("2026-03-15T12:00:00Z");
    withSimClock(at, () => {
      expect(isSimClockActive()).toBe(true);
      expect(now().getTime()).toBe(at.getTime());
    });
    expect(isSimClockActive()).toBe(false);
  });

  it("now() devuelve una COPIA: mutarla no altera el instante virtual compartido", () => {
    withSimClock(new Date("2026-03-15T12:00:00Z"), () => {
      now().setFullYear(1999);
      expect(now().getUTCFullYear()).toBe(2026);
    });
  });

  it("anida: el reloj interno gana; al salir vuelve el externo", () => {
    withSimClock(new Date("2026-01-01T00:00:00Z"), () => {
      expect(now().getUTCMonth()).toBe(0);
      withSimClock(new Date("2026-12-31T00:00:00Z"), () => expect(now().getUTCMonth()).toBe(11));
      expect(now().getUTCMonth()).toBe(0);
    });
  });

  it("propaga a través de await (async)", async () => {
    const at = new Date("2026-06-10T00:00:00Z");
    await withSimClock(at, async () => {
      await Promise.resolve();
      expect(now().getTime()).toBe(at.getTime());
    });
  });
});
