import { describe, it, expect } from "vitest";
import { avisoPresupuesto } from "@/lib/budget/budget-period";
import { resolveBudgetPeriod } from "@/lib/budget/resolve-budget-period";

/**
 * Doble mínimo del builder de Supabase: encadena todo y devuelve `filas` al await. Guarda
 * los filtros aplicados para poder afirmar que el corte se hace por (año, mes) y no solo
 * por año — ese era el hueco que dejaba ganar a un mes futuro.
 */
function db(respuestas: unknown[][]) {
  const orClauses: string[] = [];
  let i = 0;
  const make = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq", "order", "limit"]) q[m] = () => q;
    q.or = (clause: string) => {
      orClauses.push(clause);
      return q;
    };
    q.then = (res: (v: unknown) => unknown) =>
      Promise.resolve(res({ data: respuestas[i++] ?? [] }));
    return q;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cliente: { from: () => make() } as any, orClauses };
}

describe("resolveBudgetPeriod", () => {
  it("el mes en curso tiene presupuesto → se usa ese, sin aviso", async () => {
    const { cliente } = db([[{ id: "x" }]]);
    const p = await resolveBudgetPeriod(cliente, ["u1"], { month: 9, year: 2026 });
    expect(p).toEqual({ month: 9, year: 2026, isFallback: false });
    expect(avisoPresupuesto(p)).toBeNull();
  });

  it("mes en curso vacío → cae al último mes con presupuesto y lo avisa", async () => {
    const { cliente } = db([[], [{ period_month: 8, period_year: 2026 }]]);
    const p = await resolveBudgetPeriod(cliente, ["u1"], { month: 9, year: 2026 });
    expect(p).toEqual({ month: 8, year: 2026, isFallback: true });
    expect(avisoPresupuesto(p)).toContain("agosto");
  });

  it("cruza el año: enero sin presupuesto cae a diciembre del año anterior", async () => {
    const { cliente } = db([[], [{ period_month: 12, period_year: 2025 }]]);
    const p = await resolveBudgetPeriod(cliente, ["u1"], { month: 1, year: 2026 });
    expect(p).toEqual({ month: 12, year: 2025, isFallback: true });
  });

  it("busca meses ANTERIORES por (año, mes): un mes futuro del mismo año no puede ganar", async () => {
    const { cliente, orClauses } = db([[], []]);
    await resolveBudgetPeriod(cliente, ["u1"], { month: 9, year: 2026 });
    // Sin la segunda mitad, diciembre de 2026 (futuro) pasaría el filtro estando en septiembre.
    expect(orClauses).toEqual(["period_year.lt.2026,and(period_year.eq.2026,period_month.lt.9)"]);
  });

  it("sin presupuesto en ningún mes → mes en curso y NADA que avisar (los sobres valen 0 de verdad)", async () => {
    const { cliente } = db([[], []]);
    const p = await resolveBudgetPeriod(cliente, ["u1"], { month: 9, year: 2026 });
    expect(p).toEqual({ month: 9, year: 2026, isFallback: false });
    expect(avisoPresupuesto(p)).toBeNull();
  });
});
