/**
 * Rendimiento periódico: dividendos de acciones/ETF y cupón de nota estructurada.
 *
 * Lo que estos tests protegen: el neto MENSUALIZADO es lo que va a alimentar la
 * proyección de ingreso pasivo (la línea derivada del presupuesto). Si acá el
 * mensualizado se calculara con una tabla de frecuencias propia en vez de los
 * factores de `monthlyize`, la proyección diría un número y el resto de la app
 * otro — el mismo bug de dos verdades que costó #740.
 */
import { describe, it, expect } from "vitest";
import {
  calcularRendimiento,
  pagosPorAno,
  proximaFechaPago,
  esFrecuenciaPago,
  textoRendimiento,
  FRECUENCIAS_PAGO,
} from "@/modules/wealth/engine/rendimiento-periodico";
import { FREQUENCY_FACTORS } from "@/modules/financial-base/engine/monthlyize";

describe("pagos por año", () => {
  // GUARDIA ANTI-DERIVA. El motor replica los factores localmente (no puede
  // importarlos: el barrel de financial-base arrastra `server-only` y el lint
  // prohíbe el import profundo entre módulos). Este test es lo que impide que la
  // copia se desincronice del original — sin él, la duplicación sería deuda.
  it("el espejo local coincide con FREQUENCY_FACTORS", () => {
    for (const f of FRECUENCIAS_PAGO) {
      expect(pagosPorAno(f)).toBeCloseTo(FREQUENCY_FACTORS[f] * 12, 10);
    }
  });

  it("los seis valores conocidos", () => {
    expect(pagosPorAno("mensual")).toBe(12);
    expect(pagosPorAno("bimensual")).toBe(6);
    expect(pagosPorAno("trimestral")).toBeCloseTo(4, 10);
    expect(pagosPorAno("cuatrimestral")).toBeCloseTo(3, 10);
    expect(pagosPorAno("semestral")).toBeCloseTo(2, 10);
    expect(pagosPorAno("anual")).toBeCloseTo(1, 10);
  });

  it("UNA sola grafía: 'bimestral' no es una frecuencia válida", () => {
    // Dos grafías para lo mismo harían fallar el lookup en silencio (factor 0 →
    // todo daría cero). El motor conoce 'bimensual'.
    expect(esFrecuenciaPago("bimensual")).toBe(true);
    expect(esFrecuenciaPago("bimestral")).toBe(false);
    expect(esFrecuenciaPago(null)).toBe(false);
  });
});

describe("bruto → neto → mensual", () => {
  it("yield 4% anual sobre $10.000, trimestral, sin retención", () => {
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: 4, frecuencia: "trimestral", retencionPct: 0 },
      10_000,
    );
    expect(r.brutoPorPago).toBe(100); // 10.000 × 4% ÷ 4 pagos
    expect(r.netoPorPago).toBe(100);
    expect(r.netoAnual).toBe(400); // cierra con el 4% anual
    expect(r.netoMensual).toBe(33.33); // 100 ÷ 3 meses
    expect(r.yieldNetoPct).toBe(4);
  });

  it("la retención baja el neto y el yield efectivo", () => {
    // 30% es el ejemplo típico de retención en origen para no residentes; acá es
    // sólo un número del usuario, el motor no afirma tasas.
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: 4, frecuencia: "trimestral", retencionPct: 30 },
      10_000,
    );
    expect(r.brutoPorPago).toBe(100);
    expect(r.retenidoPorPago).toBe(30);
    expect(r.netoPorPago).toBe(70);
    expect(r.netoAnual).toBe(280);
    expect(r.yieldNetoPct).toBe(2.8); // 4% bruto → 2,8% neto
  });

  it("modo manual: el monto por pago manda, la base no se usa", () => {
    const r = calcularRendimiento(
      { modo: "manual", montoPorPago: 250, frecuencia: "semestral", retencionPct: 10 },
      999_999,
    );
    expect(r.brutoPorPago).toBe(250);
    expect(r.netoPorPago).toBe(225);
    expect(r.netoMensual).toBe(37.5); // 225 ÷ 6 meses
    expect(r.netoAnual).toBe(450);
  });

  it("mensualizado = neto por pago × pagos al año ÷ 12, en las seis frecuencias", () => {
    for (const f of FRECUENCIAS_PAGO) {
      const r = calcularRendimiento({ modo: "manual", montoPorPago: 600, frecuencia: f }, 0);
      expect(r.netoMensual).toBeCloseTo((600 * pagosPorAno(f)) / 12, 1);
    }
  });

  it("cupón de nota: tasa anual sobre el capital (mismo cálculo)", () => {
    // Nota de $50.000 al 8% anual con cupón semestral.
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: 8, frecuencia: "semestral", retencionPct: 0 },
      50_000,
    );
    expect(r.brutoPorPago).toBe(2000); // 50.000 × 8% ÷ 2
    expect(r.netoAnual).toBe(4000);
  });
});

describe("bordes que no pueden romper la proyección", () => {
  it("sin configuración utilizable devuelve ceros, no NaN", () => {
    const vacio = { brutoPorPago: 0, retenidoPorPago: 0, netoPorPago: 0, netoMensual: 0 };
    expect(calcularRendimiento({ modo: "yield", frecuencia: "mensual" }, 1000)).toMatchObject(
      vacio,
    );
    expect(calcularRendimiento({ modo: "manual", frecuencia: "mensual" }, 0)).toMatchObject(vacio);
    expect(
      calcularRendimiento({ modo: "yield", yieldPct: 5, frecuencia: "mensual" }, 0),
    ).toMatchObject(vacio);
  });

  it("valores no finitos no propagan NaN a la proyección", () => {
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: NaN, frecuencia: "mensual", retencionPct: NaN },
      1000,
    );
    expect(Number.isFinite(r.netoMensual)).toBe(true);
    expect(r.netoMensual).toBe(0);
  });

  it("una retención fuera de rango se acota: el neto nunca es negativo ni mayor al bruto", () => {
    const alta = calcularRendimiento(
      { modo: "manual", montoPorPago: 100, frecuencia: "mensual", retencionPct: 150 },
      0,
    );
    expect(alta.netoPorPago).toBe(0);
    const negativa = calcularRendimiento(
      { modo: "manual", montoPorPago: 100, frecuencia: "mensual", retencionPct: -20 },
      0,
    );
    expect(negativa.netoPorPago).toBe(100);
  });

  it("sin base, el yield efectivo es 0 y no divide por cero", () => {
    const r = calcularRendimiento({ modo: "manual", montoPorPago: 50, frecuencia: "mensual" }, 0);
    expect(r.yieldNetoPct).toBe(0);
    expect(r.netoMensual).toBe(50);
  });
});

describe("próxima fecha de pago (ancla + frecuencia)", () => {
  it("si el ancla todavía no llegó, la próxima es el ancla", () => {
    expect(proximaFechaPago("2026-12-15", "trimestral", "2026-09-07")).toBe("2026-12-15");
  });

  it("avanza por la frecuencia hasta alcanzar hoy", () => {
    // Ancla enero, trimestral: ene → abr → jul → oct.
    expect(proximaFechaPago("2026-01-15", "trimestral", "2026-09-07")).toBe("2026-10-15");
  });

  it("el día del pago cae hoy → es hoy, no el siguiente", () => {
    expect(proximaFechaPago("2026-09-07", "mensual", "2026-09-07")).toBe("2026-09-07");
  });

  it("cruza el año", () => {
    expect(proximaFechaPago("2026-11-10", "trimestral", "2027-01-05")).toBe("2027-02-10");
  });

  it("un ancla del 31 no se corre de mes: usa el último día del mes corto", () => {
    // 31/01 + 1 mes NO puede volverse 03/03. En febrero paga el 28.
    expect(proximaFechaPago("2026-01-31", "mensual", "2026-02-01")).toBe("2026-02-28");
    // Y en marzo vuelve al 31: el ancla no se degrada.
    expect(proximaFechaPago("2026-01-31", "mensual", "2026-03-01")).toBe("2026-03-31");
  });

  it("año bisiesto: el 29 de febrero existe", () => {
    expect(proximaFechaPago("2028-01-29", "mensual", "2028-02-01")).toBe("2028-02-29");
  });

  it("bimensual salta de dos en dos meses", () => {
    expect(proximaFechaPago("2026-01-10", "bimensual", "2026-04-01")).toBe("2026-05-10");
  });

  it("ancla ausente o con formato inválido → null, sin romper", () => {
    expect(proximaFechaPago(null, "mensual", "2026-09-07")).toBeNull();
    expect(proximaFechaPago("", "mensual", "2026-09-07")).toBeNull();
    expect(proximaFechaPago("15/12/2026", "mensual", "2026-09-07")).toBeNull();
  });
});

describe("texto de la vista previa", () => {
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;

  it("con retención nombra los tres números", () => {
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: 4, frecuencia: "trimestral", retencionPct: 30 },
      10_000,
    );
    expect(textoRendimiento(r, 30, money)).toBe(
      "≈ $100 brutos por pago · −30% impuestos = $70 netos · ≈ $23.33 netos/mes",
    );
  });

  it("sin retención NO menciona impuestos (un '−0%' es ruido)", () => {
    const r = calcularRendimiento(
      { modo: "manual", montoPorPago: 60, frecuencia: "mensual", retencionPct: 0 },
      0,
    );
    expect(textoRendimiento(r, 0, money)).toBe("≈ $60 brutos por pago · ≈ $60 netos/mes");
  });

  it("sin monto todavía no hay vista previa", () => {
    const r = calcularRendimiento({ modo: "yield", frecuencia: "mensual" }, 0);
    expect(textoRendimiento(r, 30, money)).toBeNull();
  });
});
