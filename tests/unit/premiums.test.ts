import { describe, it, expect } from "vitest";
import { selectPlansToCharge, planPaidUntil } from "@/modules/wealth/engine/premiums";

describe("selectPlansToCharge · no recobrar meses ya adelantados/cobrados", () => {
  const plan = (id: string) => ({ id, monthly_contribution: 100 });

  it("salta los planes que ya tienen fila en el periodo", () => {
    const plans = [plan("a"), plan("b"), plan("c")];
    // b ya fue adelantado (fila pre-creada); a y c no.
    const out = selectPlansToCharge(plans, new Set(["b"]));
    expect(out.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("si todos están cubiertos, no cobra ninguno", () => {
    const plans = [plan("a"), plan("b")];
    expect(selectPlansToCharge(plans, new Set(["a", "b"]))).toEqual([]);
  });

  it("sin filas previas, cobra todos", () => {
    const plans = [plan("a"), plan("b")];
    expect(selectPlansToCharge(plans, new Set()).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("planPaidUntil · mes hasta el que las cuotas están al día", () => {
  const p = (year: number, month: number) => ({ year, month });

  it("devuelve el periodo MÁS ALTO con aporte", () => {
    const periods = [p(2026, 7), p(2026, 9), p(2026, 8)];
    expect(planPaidUntil(periods, null)).toEqual({ year: 2026, month: 9 });
  });

  it("no pasa el vencimiento: se topa en el mes/año de maturity", () => {
    // Adelantado hasta dic-2027 pero el plan vence oct-2026 → tope oct-2026.
    const periods = [p(2026, 8), p(2027, 12)];
    expect(planPaidUntil(periods, "2026-10-15")).toEqual({ year: 2026, month: 10 });
  });

  it("si el máximo no pasa el vencimiento, lo deja igual", () => {
    const periods = [p(2026, 6), p(2026, 7)];
    expect(planPaidUntil(periods, "2030-01-01")).toEqual({ year: 2026, month: 7 });
  });

  it("sin aportes → null", () => {
    expect(planPaidUntil([], "2026-10-01")).toBeNull();
    expect(planPaidUntil([], null)).toBeNull();
  });
});
