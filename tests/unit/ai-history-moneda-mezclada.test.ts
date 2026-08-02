/**
 * Series que CRUZAN dos monedas (el usuario cambió su moneda a mitad de la historia).
 *
 * Sin esto el render tomaba la moneda del snapshot más reciente y pintaba TODA la serie
 * con ese símbolo: ₡3.000.000 y $3.000 salían con el mismo signo, y el cierre —"en
 * conjunto subió ₡2.997.000"— era una resta entre unidades distintas. Una cifra
 * inventada con cara de real, justo lo que la regla de oro del módulo prohíbe.
 *
 * Ahora cada mes va en SU moneda y la variación se reemplaza por la aclaración. Los
 * montos no se convierten: no hay tipo de cambio por fecha, y usar el de hoy mentiría
 * sobre la evolución.
 */
import { describe, it, expect } from "vitest";
import {
  construirHistorial,
  renderHistorial,
  colapsarAMensual,
  type SeriePunto,
} from "@/lib/ai/history-query";

const p = (periodo: string, valor: number, moneda?: string): SeriePunto => ({
  periodo,
  valor,
  ...(moneda ? { moneda } : {}),
});

const opts = { metrica: "patrimonio" as const, moneda: "CRC" };

describe("detección de monedas mezcladas", () => {
  it("una sola moneda → sin aclaración (comportamiento de siempre)", () => {
    const r = construirHistorial([p("2026-06", 100, "CRC"), p("2026-07", 120, "CRC")], opts);
    expect(r.monedasMezcladas).toBeNull();
    expect(r.variacion?.delta).toBe(20);
    expect(renderHistorial(r)).toContain("En conjunto");
  });

  it("serie sin moneda declarada (gasto/ingreso/ahorro) → sin aclaración", () => {
    const r = construirHistorial([p("2026-06", 100), p("2026-07", 120)], {
      ...opts,
      metrica: "gasto",
    });
    expect(r.monedasMezcladas).toBeNull();
    expect(renderHistorial(r)).toContain("En conjunto");
  });

  it("dos monedas → las lista en el orden en que aparecen", () => {
    const r = construirHistorial([p("2026-06", 3_000_000, "CRC"), p("2026-07", 3_000, "USD")], opts);
    expect(r.monedasMezcladas).toEqual(["CRC", "USD"]);
  });

  it("solo mira la VENTANA mostrada: un cambio de moneda viejo no aclara de más", () => {
    const serie = [
      p("2026-01", 3_000, "USD"),
      p("2026-06", 3_000_000, "CRC"),
      p("2026-07", 3_200_000, "CRC"),
    ];
    expect(construirHistorial(serie, { ...opts, meses: 2 }).monedasMezcladas).toBeNull();
    expect(construirHistorial(serie, { ...opts, meses: 3 }).monedasMezcladas).toEqual(["USD", "CRC"]);
  });
});

describe("render con monedas mezcladas", () => {
  const r = construirHistorial(
    [p("2026-06", 3_000_000, "CRC"), p("2026-07", 3_000, "USD")],
    opts,
  );
  const texto = renderHistorial(r);

  it("aclara el cruce en vez de dar una variación entre unidades distintas", () => {
    expect(texto).toContain("cambia de moneda");
    expect(texto).toContain("CRC y USD");
    expect(texto).not.toContain("En conjunto"); // el cierre con el delta no aparece
    expect(texto).not.toMatch(/subió|bajó/);
  });

  it("cada mes se muestra en SU moneda, no todos con el símbolo del último", () => {
    const [linea1, linea2] = texto.split("\n").filter((l) => l.startsWith("•"));
    expect(linea1).toContain("₡");
    expect(linea2).toContain("$");
    expect(linea2).not.toContain("₡");
  });

  it("explica POR QUÉ no convierte (no hay tipo de cambio por fecha)", () => {
    expect(texto).toContain("tipo de cambio");
  });

  it("la variación sigue en el payload, pero marcada como mezclada para el modelo", () => {
    // El texto ya no la afirma; el objeto la conserva para no perder información, y
    // `monedasMezcladas` es la bandera que el modelo ve junto a ella.
    expect(r.variacion).not.toBeNull();
    expect(r.monedasMezcladas).toEqual(["CRC", "USD"]);
  });
});

describe("la moneda viaja punto a punto desde el colapso mensual", () => {
  it("colapsarAMensual conserva la moneda del día que gana el mes", () => {
    const serie = colapsarAMensual([
      { fecha: "2026-06-01", valor: 1, moneda: "USD" },
      { fecha: "2026-06-30", valor: 2, moneda: "CRC" }, // último del mes: gana
    ]);
    expect(serie).toEqual([{ periodo: "2026-06", valor: 2, moneda: "CRC" }]);
  });

  it("sin moneda de entrada no la inventa", () => {
    expect(colapsarAMensual([{ fecha: "2026-06-30", valor: 2 }])).toEqual([
      { periodo: "2026-06", valor: 2 },
    ]);
  });
});
