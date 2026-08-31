import { describe, it, expect } from "vitest";
import {
  buildBaseReading,
  buildCapsule,
  type ReadingInput,
} from "@/modules/financial-base/engine/reading";
import { computeV2Totals } from "@/modules/financial-base/engine/base-v2";

/**
 * #98 · la "Lectura de tu Base Financiera" NO debe repetir idéntica una línea de relleno.
 * Antes, con un perfil sano ninguna acción condicional disparaba y el relleno era
 * `while (actions.length < 3) push(MISMA_CADENA)` → 3 viñetas iguales.
 */
const fmt = (n: number) => `₡${Math.round(n)}`;

// Perfil sano donde NINGUNA acción condicional dispara (free>0, dentro de presupuesto,
// ingresos diversificados, ratio 0.8 → ni automatiza-ahorro ni ajusta-ratio): fuerza el relleno.
function healthyInput(): ReadingInput {
  return {
    totals: computeV2Totals({
      budgetIncome: 1000,
      realIncome: 1000,
      budgetExpense: 800,
      realExpense: 800,
    }),
    financialPressure: "baja",
    expenseComposition: [],
    incomeComposition: [
      { key: "a", label: "Sueldo", value: 600, pct: 0.6 },
      { key: "b", label: "Extra", value: 400, pct: 0.4 },
    ],
    topExpenseCategory: null,
    currencyFormat: fmt,
    periodLabel: "agosto",
  };
}

const noDupes = (xs: string[]) => new Set(xs).size === xs.length;

describe("buildBaseReading · relleno sin duplicados (#98)", () => {
  const r = buildBaseReading(healthyInput());

  it("las acciones se rellenan hasta 3 sin repetir ninguna línea", () => {
    expect(r.actions.length).toBe(3);
    expect(noDupes(r.actions)).toBe(true);
  });

  it("los insights no repiten ninguna línea", () => {
    expect(noDupes(r.insights)).toBe(true);
  });
});

describe("buildCapsule · relleno sin duplicados (#98)", () => {
  for (const kind of ["income", "expense"] as const) {
    it(`(${kind}) insights y acciones sin líneas repetidas`, () => {
      const r = buildCapsule(kind, healthyInput());
      expect(noDupes(r.insights)).toBe(true);
      expect(noDupes(r.actions)).toBe(true);
    });
  }
});
