import { describe, it, expect } from "vitest";
import { projectInvestment } from "@/lib/ai/tools";
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";

/**
 * Evals DORADOS de confianza — casos derivados de una conversación real donde el
 * asesor falló, para que esos fallos no vuelvan. Deterministas: prueban funciones
 * PURAS directamente (sin llamar al modelo). No tocan el harness existente
 * (advisor.evals.test.ts); siguen su mismo patrón (golden + motor real).
 */

// Interés compuesto INDEPENDIENTE (mes a mes; aporte al final de cada mes = anualidad
// vencida). Reimplementado a mano para validar la fórmula cerrada de projectInvestment
// SIN reusar su implementación.
function fvMonthly(inicial: number, aporte: number, months: number, annualPct: number): number {
  const r = annualPct / 100 / 12;
  let balance = inicial;
  for (let m = 0; m < months; m++) balance = balance * (1 + r) + aporte;
  return balance;
}

describe("evals golden · matemática de proyección confiable (projectInvestment)", () => {
  it("15 años @10% con capital inicial → valor_futuro / total_aportado / interés correctos", () => {
    // Ancla el bug de la tabla mal calculada: estos parámetros salen de la conversación real.
    const monto_inicial = 13_000_000;
    const aporte_mensual = 207_365;
    const anios = 15;
    const rendimiento_anual_pct = 10;
    const months = anios * 12; // 180

    const proj = projectInvestment(
      { monto_inicial, aporte_mensual, anios, rendimiento_anual_pct },
      "CRC",
    );

    // Cálculo hecho a mano en el test, comparado con tolerancia (₡1).
    const expectedFuturo = fvMonthly(monto_inicial, aporte_mensual, months, rendimiento_anual_pct);
    const expectedAportado = monto_inicial + aporte_mensual * months; // 50 325 700
    const expectedInteres = expectedFuturo - expectedAportado;

    // total_aportado es exacto (no depende del rendimiento).
    expect(proj.total_aportado).toBe(expectedAportado);
    expect(expectedAportado).toBe(50_325_700); // ancla legible

    // valor_futuro e interés ganado coinciden con el cálculo independiente (tolerancia ₡1).
    expect(Math.abs(proj.valor_futuro - expectedFuturo)).toBeLessThan(1);
    expect(Math.abs(proj.interes_ganado - expectedInteres)).toBeLessThan(1);

    // Coherencia interna: interés = futuro − aportado; el rendimiento supuesto se refleja.
    expect(proj.interes_ganado).toBeCloseTo(proj.valor_futuro - proj.total_aportado, 2);
    expect(proj.rendimiento_supuesto_pct).toBe(10);
    expect(proj.moneda).toBe("CRC");

    // Sanity: a 10% y 15 años el patrimonio final supera holgadamente lo aportado.
    expect(proj.valor_futuro).toBeGreaterThan(expectedAportado);
  });
});

describe("evals golden · el contexto se traduce al prompt (buildSystemPrompt)", () => {
  it("con métricas pobladas, el prompt las entrega al modelo (no se pierden)", () => {
    const ctx: FinancialContext = {
      currency: "CRC",
      netWorth: 105_040_035,
      portfolioValue: 61_581_512,
      numeroDeIndependencia: 290_400_000,
      investableWealth: 13_000_000,
    };
    const prompt = buildSystemPrompt(ctx);

    // Cada métrica poblada aparece con su label y su valor.
    expect(prompt).toContain("Patrimonio neto: 105040035 CRC.");
    expect(prompt).toContain("Valor de mercado del portafolio: 61581512 CRC.");
    expect(prompt).toContain("Número de Independencia: 290400000 CRC");
    expect(prompt).toContain("Patrimonio invertible: 13000000 CRC.");
  });

  it("con contexto mínimo, el prompt NO inventa cifras patrimoniales", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });

    expect(prompt).toContain("Moneda principal: CRC.");
    // Sin campos poblados, las líneas de hechos derivadas no deben aparecer.
    expect(prompt).not.toContain("Número de Independencia:");
    expect(prompt).not.toContain("Patrimonio invertible:");
    expect(prompt).not.toContain("Valor de mercado del portafolio:");
    expect(prompt).not.toContain("Patrimonio neto:");
  });
});

describe("evals golden · regla anti-invención en el prompt", () => {
  it("buildSystemPrompt instruye no inventar datos del usuario", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("no inventes datos del usuario");
    // Refuerzo: si una métrica no está en el contexto, dilo y ofrece calcularla; no la inventes.
    expect(prompt).toContain("no la inventes");
  });
});
