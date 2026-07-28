// La zona horaria del runner decide si UTC y local difieren. La fijamos a Costa Rica
// (UTC-6) ANTES de crear cualquier Date, para que el caso nocturno sea decisivo y
// reproducible (en CI, que suele correr en UTC, si no se fija no se distinguiría del bug).
process.env.TZ = "America/Costa_Rica";

import { describe, it, expect } from "vitest";
import { todayLocalISO } from "@/lib/validation";

describe("todayLocalISO", () => {
  it("un movimiento de noche usa la fecha LOCAL, no la de UTC (el bug del aporte)", () => {
    // Mismo instante: 2026-07-28 01:28 UTC = 2026-07-27 19:28 en Costa Rica (UTC-6).
    const instante = new Date("2026-07-28T01:28:00Z");
    // El bug: toISOString (UTC) lo fecha el 28 (mañana) → queda fuera del corte de hoy.
    expect(instante.toISOString().slice(0, 10)).toBe("2026-07-28");
    // El fix: la fecha local es el 27 (hoy), que es lo que el usuario espera.
    expect(todayLocalISO(instante)).toBe("2026-07-27");
  });

  it("es independiente de la TZ para una fecha construida en local", () => {
    // Constructor local + getters locales: el 27 a las 11:30pm es el 27 en cualquier runner.
    const noche = new Date(2026, 6, 27, 23, 30, 0);
    expect(todayLocalISO(noche)).toBe("2026-07-27");
  });

  it("rellena mes y día a dos dígitos", () => {
    expect(todayLocalISO(new Date(2026, 0, 5, 9, 0, 0))).toBe("2026-01-05");
  });
});
