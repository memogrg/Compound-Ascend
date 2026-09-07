/**
 * Recordatorio de cobro de dividendo.
 *
 * La regla: avisa cuando la fecha de pago YA llegó, con el monto NETO estimado
 * — el mismo que proyecta el ingreso pasivo, para que el aviso y el flujo del
 * mes no digan cifras distintas. Y no avisa de algo ya cobrado.
 */
import { describe, it, expect } from "vitest";
import {
  detectDividendosPorCobrar,
  type HoldingConDividendo,
} from "@/lib/insights/dividendo-cobro";

const base = (over: Partial<HoldingConDividendo> = {}): HoldingConDividendo => ({
  id: "h1",
  label: "VOO",
  currency: "USD",
  base: 10_000,
  paysDividends: true,
  dividendMode: "yield",
  dividendYieldPct: 4,
  dividendAmount: null,
  dividendFrequency: "trimestral",
  dividendWithholdingPct: 30,
  dividendNextDate: "2026-09-01",
  ultimoPagoRegistrado: null,
  ...over,
});

const HOY = "2026-09-07";

describe("cuándo avisa", () => {
  it("la fecha de pago ya pasó → avisa", () => {
    const out = detectDividendosPorCobrar([base()], HOY);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("dividendo_por_cobrar");
    expect(out[0]!.relatedId).toBe("h1");
    expect(out[0]!.title).toContain("VOO");
  });

  it("la fecha es HOY → avisa (el pago es hoy, no mañana)", () => {
    expect(detectDividendosPorCobrar([base({ dividendNextDate: HOY })], HOY)).toHaveLength(1);
  });

  it("la fecha es futura → NO avisa", () => {
    // Avisar antes sólo genera un registro con fecha equivocada.
    expect(detectDividendosPorCobrar([base({ dividendNextDate: "2026-12-01" })], HOY)).toEqual([]);
  });

  it("sin ancla → no hay nada que recordar", () => {
    expect(detectDividendosPorCobrar([base({ dividendNextDate: null })], HOY)).toEqual([]);
  });

  it("la posición no paga dividendos → no avisa", () => {
    expect(detectDividendosPorCobrar([base({ paysDividends: false })], HOY)).toEqual([]);
  });
});

describe("no avisa de algo ya cobrado", () => {
  it("hay un pago registrado en la fecha o después → se calla", () => {
    // Sin este corte el aviso quedaría pegado hasta mover el ancla a mano.
    expect(detectDividendosPorCobrar([base({ ultimoPagoRegistrado: "2026-09-01" })], HOY)).toEqual(
      [],
    );
    expect(detectDividendosPorCobrar([base({ ultimoPagoRegistrado: "2026-09-05" })], HOY)).toEqual(
      [],
    );
  });

  it("el pago registrado es ANTERIOR al vencimiento → sigue avisando", () => {
    // Cobró el trimestre pasado; éste todavía no.
    expect(
      detectDividendosPorCobrar([base({ ultimoPagoRegistrado: "2026-06-01" })], HOY),
    ).toHaveLength(1);
  });
});

describe("el monto del aviso", () => {
  it("es el NETO, y nombra bruto e impuestos cuando hay retención", () => {
    const [i] = detectDividendosPorCobrar([base()], HOY);
    // 10.000 × 4% ÷ 4 = 100 brutos · −30% = 70 netos
    expect(i!.metric).toBe(70);
    expect(i!.body).toContain("70");
    expect(i!.body).toContain("100"); // el bruto, entre paréntesis
    expect(i!.body).toContain("30"); // lo retenido
  });

  it("sin retención no menciona impuestos", () => {
    const [i] = detectDividendosPorCobrar([base({ dividendWithholdingPct: 0 })], HOY);
    expect(i!.metric).toBe(100);
    expect(i!.body).not.toContain("impuestos");
  });

  it("modo manual: el monto por pago manda", () => {
    const [i] = detectDividendosPorCobrar(
      [base({ dividendMode: "manual", dividendAmount: 250, dividendWithholdingPct: 0 })],
      HOY,
    );
    expect(i!.metric).toBe(250);
  });

  it("sin monto estimable no avisa: no hay nada que prellenar", () => {
    expect(
      detectDividendosPorCobrar([base({ dividendYieldPct: 0, dividendAmount: null })], HOY),
    ).toEqual([]);
  });

  it("una frecuencia con grafía desconocida no avisa (en vez de dar cero)", () => {
    expect(detectDividendosPorCobrar([base({ dividendFrequency: "bimestral" })], HOY)).toEqual([]);
  });
});

describe("varias posiciones", () => {
  it("una por holding, y sólo las que tocan", () => {
    const out = detectDividendosPorCobrar(
      [
        base({ id: "a", label: "VOO" }),
        base({ id: "b", label: "SCHD", dividendNextDate: "2027-01-01" }),
        base({ id: "c", label: "JEPI", ultimoPagoRegistrado: "2026-09-02" }),
      ],
      HOY,
    );
    expect(out.map((i) => i.relatedId)).toEqual(["a"]);
  });
});
