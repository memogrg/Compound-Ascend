import { describe, it, expect } from "vitest";
import { buildEvidencePack } from "@/lib/ai/investment-report/evidence";
import { renderEvidenceReport } from "@/lib/ai/investment-report/render";
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/orchestrator";

// RENDER del informe: plantilla PURA (0 tokens). Lo que se prueba acá es la HONESTIDAD del texto —
// una sección sin dato dice qué falta y qué registrar, y nunca aparece una cifra que no venga del pack.

type Holding = NonNullable<FinancialContext["holdings"]>[number];

// La cripto cotiza en USD: la fila viene en dólares aunque el usuario vea la app en colones.
const holding = (over: Partial<Holding> = {}): Holding => ({
  symbol: "BTC",
  name: "Bitcoin",
  assetType: "cripto",
  quantity: 1,
  invested: 2_000,
  value: 3_000,
  price: 3_000,
  pl: 1_000,
  plPct: 0.5,
  currency: "CRC",
  monedaFila: "USD",
  valorPrimario: over.valorPrimario ?? 1_500_000,
  priceUnavailable: false,
  ...over,
});

const montos = (...pares: [number, string][]) => pares.map(([monto, moneda]) => ({ monto, moneda }));

type Conc = NonNullable<FinancialContext["concentracion"]>;
/** La concentración CANÓNICA del contexto (motor). El pack la consume, no la recalcula. */
const conc = (over: Partial<Conc> = {}): Conc => ({
  moneda: "CRC",
  porPosicion: [],
  porMoneda: [],
  porRegion: [],
  porTipo: [],
  top1Pct: 0,
  top3Pct: 0,
  hhi: 0,
  slicesOmitidas: 0,
  ...over,
});

const ctx = (over: Partial<FinancialContext> = {}): FinancialContext => ({ currency: "CRC", ...over });
const tool = (over: Partial<ToolContext> = {}): ToolContext => ({ currency: "CRC", debts: [], ...over });

const render = (c: FinancialContext, t: ToolContext = tool()) =>
  renderEvidenceReport(buildEvidencePack(c, t), t.currency);

describe("renderEvidenceReport · portafolio vacío", () => {
  const md = render(ctx());

  it("dice qué falta y qué registrar en cada sección sin dato (no la omite)", () => {
    expect(md).toContain("No tenés posiciones de inversión registradas");
    expect(md).toContain("Para desbloquearla:");
    expect(md).toMatch(/no puedo (calcular|medir)/i);
  });

  it("cierra siempre con la nota de fotografía, no recomendación", () => {
    expect(md.trimEnd().endsWith("_Esto es una fotografía de tus datos, no una recomendación de inversión._")).toBe(true);
  });
});

describe("renderEvidenceReport · posición única", () => {
  const md = render(
    ctx({
      holdings: [holding()],
      investmentValue: montos([3_000, "USD"]),
      investmentInvested: montos([2_000, "USD"]),
      investmentPL: montos([1_000, "USD"]),
      investmentValueBase: { monto: 1_500_000, moneda: "CRC" },
      concentracion: conc({
        porPosicion: [{ label: "BTC", valor: 1_500_000, pct: 1 }],
        porTipo: [{ label: "cripto", valor: 1_500_000, pct: 1 }],
        porMoneda: [{ label: "USD", valor: 1_500_000, pct: 1 }],
        top1Pct: 1,
        top3Pct: 1,
        hhi: 1,
      }),
    }),
    tool({ currency: "CRC" }),
  );

  it("imprime la posición, el total y la concentración alta con el umbral explícito", () => {
    expect(md).toContain("**BTC** (cripto)");
    expect(md).toContain("100% del portafolio");
    expect(md).toContain("concentración **alta**");
    expect(md).toContain("35%");
  });

  it("la posición se REPORTA en la moneda en que cotiza, no en la de visualización", () => {
    // El usuario ve la app en colones, pero una cripto cotiza en dólares: nada de "₡3.000".
    expect(md).toContain("$3.000");
    expect(md).not.toContain("₡3.000");
  });

  it("con tipo de cambio, el total convertido aparece marcado como conversión", () => {
    const conv = render(
      ctx({
        holdings: [holding()],
        investmentValue: montos([3_000, "USD"]),
        investmentInvested: montos([2_000, "USD"]),
        investmentPL: montos([1_000, "USD"]),
        portfolioValueConvertido: { monto: 1_590_000, moneda: "CRC" },
      }),
      tool({ currency: "CRC" }),
    );
    expect(conv).toMatch(/Convertido a tu moneda de visualización.*₡1\.590\.000/);
  });
});

describe("renderEvidenceReport · portafolio MIXTO (dólares + colones)", () => {
  const mixto = ctx({
    holdings: [
      holding({ symbol: "BTC", monedaFila: "USD", value: 3_000, invested: 2_000, pl: 1_000, valorPrimario: 1_500_000 }),
      holding({ symbol: null, name: "Casa", assetType: "inmueble", currency: "CRC", monedaFila: "CRC", value: 45_000_000, invested: 40_000_000, pl: 5_000_000, plPct: 0.125, price: null, priceUnavailable: true, valorPrimario: 45_000_000 }),
    ],
    investmentValue: montos([45_000_000, "CRC"], [3_000, "USD"]),
    investmentInvested: montos([40_000_000, "CRC"], [2_000, "USD"]),
    investmentPL: montos([5_000_000, "CRC"], [1_000, "USD"]),
    investmentValueBase: { monto: 46_500_000, moneda: "CRC" },
    concentracion: conc({
      porPosicion: [
        { label: "Casa", valor: 45_000_000, pct: 0.968 },
        { label: "BTC", valor: 1_500_000, pct: 0.032 },
      ],
      porTipo: [
        { label: "inmueble", valor: 45_000_000, pct: 0.968 },
        { label: "cripto", valor: 1_500_000, pct: 0.032 },
      ],
      porMoneda: [
        { label: "CRC", valor: 45_000_000, pct: 0.968 },
        { label: "USD", valor: 1_500_000, pct: 0.032 },
      ],
      top1Pct: 0.968,
      top3Pct: 1,
      hhi: 0.938,
    }),
  });

  it("da un subtotal por moneda, sin sumarlos entre sí", () => {
    const md = render(mixto, tool({ currency: "CRC" }));
    expect(md).toContain("₡45.000.000 + $3.000");
    expect(md).toContain("₡40.000.000 + $2.000");
  });

  it("sin tipo de cambio lo DICE en vez de inventar un total único", () => {
    const md = render(mixto, tool({ currency: "CRC" }));
    expect(md).toMatch(/No hay tipo de cambio disponible/i);
  });

  it("la exposición por moneda sale de dónde cotiza cada posición", () => {
    const md = render(mixto, tool({ currency: "CRC" }));
    expect(md).toContain("Por la moneda en que cotiza cada posición:");
    expect(md).toContain("CRC 97%");
    expect(md).toContain("USD 3%");
  });
});

describe("renderEvidenceReport · precio no disponible en la posición más grande", () => {
  const md = render(
    ctx({
      holdings: [
        holding({ symbol: "KMNO", value: 3_000, invested: 3_000, pl: 0, plPct: 0, price: null, priceUnavailable: true, valorPrimario: 3_000_000 }),
        holding({ symbol: "VOO", assetType: "etf", value: 1_000, invested: 800, pl: 200, plPct: 0.25, valorPrimario: 1_000_000 }),
      ],
      investmentValue: montos([4_000, "USD"]),
      investmentValueBase: { monto: 4_000_000, moneda: "CRC" },
      concentracion: conc({
        porPosicion: [
          { label: "KMNO", valor: 3_000_000, pct: 0.75 },
          { label: "VOO", valor: 1_000_000, pct: 0.25 },
        ],
        top1Pct: 0.75,
        top3Pct: 1,
        hhi: 0.625,
      }),
    }),
  );

  it("aclara que el valor de esa posición es lo invertido, no el de mercado", () => {
    expect(md).toContain("sin precio de mercado ahora");
    expect(md).toContain("el valor usado es lo invertido");
  });

  it("nombra la posición sin cotizar en la sección de frescura", () => {
    expect(md).toMatch(/1 de 2 posiciones no cotizaron: KMNO/);
  });
});

describe("renderEvidenceReport · Número de Independencia ausente", () => {
  it("la brecha se declara imposible de medir, con el motivo, y el informe SIGUE", () => {
    const md = render(ctx({ holdings: [holding()], mesesDeColchon: 6 }), tool({ investableWealth: 5_000_000 }));
    expect(md).toContain("No puedo medir la brecha porque falta tu Número de Independencia");
    expect(md).toContain("## Defensa"); // el resto del informe se imprime igual
    expect(md).toContain("6,0 meses de colchón");
  });
});

describe("renderEvidenceReport · deuda contra el 8% supuesto", () => {
  const debt = (apr: number) => ({ id: "d1", name: "Tarjeta", balance: 800_000, apr, minPayment: 40_000 });

  it("APR sobre el 8%: lo presenta como DATO comparado y marca el supuesto", () => {
    const md = render(ctx({ holdings: [holding()] }), tool({ debts: [debt(24)] }));
    expect(md).toContain("**Tarjeta**");
    expect(md).toContain("24,0% anual");
    expect(md).toContain("a favor de la deuda");
    expect(md).toContain("supuesto de referencia, no un rendimiento garantizado");
    // Es una comparación, no un consejo: nada de "pagá primero" / "deberías".
    expect(md).not.toMatch(/deber[ií]as|te conviene|priorizá|pagá primero/i);
  });

  it("APR bajo el 8%: no marca deuda cara", () => {
    const md = render(ctx({ holdings: [holding()] }), tool({ debts: [debt(5)] }));
    expect(md).toContain("el supuesto queda por encima de esa tasa");
    expect(md).not.toContain("a favor de la deuda");
  });

  it("sin deudas: lo dice explícitamente", () => {
    const md = render(ctx({ holdings: [holding()] }));
    expect(md).toContain("No tenés deudas registradas");
  });
});

describe("renderEvidenceReport · descalce de moneda", () => {
  it("reporta el peso por moneda y explica el efecto del tipo de cambio, sin recomendar", () => {
    const md = render(
      ctx({
        holdings: [
          holding({ monedaFila: "USD", value: 5_660, valorPrimario: 3_000_000 }),
          holding({ symbol: "CERT", assetType: "otro", currency: "CRC", monedaFila: "CRC", value: 1_000_000, valorPrimario: 1_000_000 }),
        ],
        concentracion: conc({
          porMoneda: [
            { label: "USD", valor: 3_000_000, pct: 0.75 },
            { label: "CRC", valor: 1_000_000, pct: 0.25 },
          ],
        }),
      }),
      tool({ currency: "CRC" }),
    );
    expect(md).toContain("USD 75% · CRC 25%");
    expect(md).toContain("se mueve con el tipo de cambio");
    expect(md).not.toMatch(/deber[ií]as|te conviene|cambiá|pasá a/i);
  });
});

describe("renderEvidenceReport · banderas del diagnóstico", () => {
  it("imprime los códigos §15 tal cual", () => {
    const md = render(ctx({ holdings: [holding()], patrimonioDiagnosis: ["alta_concentracion"] }));
    expect(md).toContain("- alta_concentracion");
  });

  it("sin banderas lo dice, no deja la sección muda", () => {
    expect(render(ctx({ holdings: [holding()] }))).toContain("no levantó banderas");
  });
});
