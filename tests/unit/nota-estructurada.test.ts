/**
 * Lectura de riesgo de una nota estructurada.
 *
 * Es informativa: describe los términos que el usuario cargó, sin evaluar si la
 * nota es buena ni proyectar mercado. Lo que estos tests protegen es que las
 * frases no digan de más ni de menos — en un producto donde el capital puede
 * quedar expuesto, una frase optimista de más es peor que ninguna frase.
 */
import { describe, it, expect } from "vitest";
import { lecturaDeRiesgo } from "@/modules/wealth/engine/nota-estructurada";

describe("el capital", () => {
  it("protección 100% → protegido, y lo dice sin condicionales", () => {
    const r = lecturaDeRiesgo({ proteccionPct: 100 });
    expect(r.nivel).toBe("protegido");
    expect(r.puntos[0]).toContain("100%");
    expect(r.puntos[0]).toContain("al vencimiento");
  });

  it("con barrera → condicionado, y nombra el subyacente", () => {
    const r = lecturaDeRiesgo({ barreraPct: 70, subyacente: "S&P 500" });
    expect(r.nivel).toBe("condicionado");
    expect(r.puntos[0]).toContain("70%");
    expect(r.puntos[0]).toContain("S&P 500");
    expect(r.puntos[0]).toContain("expuesto");
  });

  it("barrera + protección parcial: dice las dos cosas, en ese orden", () => {
    // El riesgo va primero; el consuelo después.
    const r = lecturaDeRiesgo({ barreraPct: 70, proteccionPct: 90 });
    expect(r.puntos[0]).toContain("Barrera");
    expect(r.puntos[1]).toContain("90%");
  });

  it("protección 0 → expuesto, sin eufemismos", () => {
    const r = lecturaDeRiesgo({ proteccionPct: 0 });
    expect(r.nivel).toBe("expuesto");
    expect(r.puntos[0]).toContain("perder parte o todo");
  });

  it("sin términos de capital → desconocido, y no inventa una frase", () => {
    const r = lecturaDeRiesgo({});
    expect(r.nivel).toBe("desconocido");
    expect(r.puntos).toEqual([]);
  });
});

describe("participación", () => {
  it("100% o más se enuncia neutro", () => {
    const r = lecturaDeRiesgo({ participacionPct: 120, subyacente: "Nasdaq" });
    expect(r.puntos.some((p) => p.includes("120%") && !p.includes("sólo"))).toBe(true);
  });

  it("menos de 100% dice 'sólo': es una limitación, no un beneficio", () => {
    const r = lecturaDeRiesgo({ participacionPct: 60 });
    expect(r.puntos.some((p) => p.includes("sólo") && p.includes("60%"))).toBe(true);
  });
});

describe("autocall", () => {
  it("con fecha de observación la nombra", () => {
    const r = lecturaDeRiesgo({ autocall: true, autocallDate: "2027-03-15" });
    expect(r.puntos.some((p) => p.includes("15/03/2027"))).toBe(true);
  });

  it("sin fecha igual avisa que el plazo real puede ser menor", () => {
    const r = lecturaDeRiesgo({ autocall: true });
    expect(r.puntos.some((p) => p.includes("plazo real puede ser menor"))).toBe(true);
  });

  it("sin autocall no menciona nada", () => {
    const r = lecturaDeRiesgo({ autocall: false, proteccionPct: 100 });
    expect(r.puntos.some((p) => p.toLowerCase().includes("autocall"))).toBe(false);
  });
});

describe("riesgo de crédito del emisor", () => {
  it("va SIEMPRE que haya emisor, incluso con capital 100% protegido", () => {
    // Es lo que más se pasa por alto: la protección vale lo que vale quien la
    // promete. No puede quedar tapada por un "protegido al 100%".
    const r = lecturaDeRiesgo({ proteccionPct: 100, emisor: "Banco X" });
    const ultima = r.puntos[r.puntos.length - 1]!;
    expect(ultima).toContain("Banco X");
    expect(ultima).toContain("riesgo de crédito");
  });

  it("sin emisor cargado no se inventa la frase", () => {
    const r = lecturaDeRiesgo({ proteccionPct: 100 });
    expect(r.puntos.some((p) => p.includes("riesgo de crédito"))).toBe(false);
  });
});

describe("caso completo", () => {
  it("una nota típica: barrera, participación, autocall y emisor", () => {
    const r = lecturaDeRiesgo({
      emisor: "JP Morgan",
      subyacente: "S&P 500",
      proteccionPct: 100,
      barreraPct: 70,
      autocall: true,
      autocallDate: "2027-06-30",
      participacionPct: 150,
    });
    // Con barrera, el capital NO se anuncia como protegido a secas.
    expect(r.nivel).toBe("condicionado");
    expect(r.puntos).toHaveLength(5);
    expect(r.puntos[0]).toContain("Barrera");
    expect(r.puntos[r.puntos.length - 1]).toContain("JP Morgan");
  });

  it("valores no finitos no rompen ni generan frases vacías", () => {
    const r = lecturaDeRiesgo({ proteccionPct: NaN, barreraPct: NaN, participacionPct: NaN });
    expect(r.nivel).toBe("desconocido");
    expect(r.puntos).toEqual([]);
  });
});
