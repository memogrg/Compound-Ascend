import { describe, it, expect } from "vitest";
import { buildEvidencePack } from "@/lib/ai/investment-report/evidence";
import { renderEvidenceReport } from "@/lib/ai/investment-report/render";
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/orchestrator";

// RENDER del informe: plantilla PURA (0 tokens). Lo que se prueba acá es la HONESTIDAD del texto —
// una sección sin dato dice qué falta y qué registrar, y nunca aparece una cifra que no venga del pack.

type Holding = NonNullable<FinancialContext["holdings"]>[number];

const holding = (over: Partial<Holding> = {}): Holding => ({
  symbol: "BTC",
  name: "Bitcoin",
  assetType: "cripto",
  quantity: 1,
  invested: 1_000_000,
  value: 1_500_000,
  price: 1_500_000,
  pl: 500_000,
  plPct: 0.5,
  currency: "USD",
  priceUnavailable: false,
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
    ctx({ holdings: [holding()], investmentValue: 1_500_000, investmentInvested: 1_000_000, investmentPL: 500_000 }),
    tool({ currency: "CRC" }),
  );

  it("imprime la posición, el total y la concentración alta con el umbral explícito", () => {
    expect(md).toContain("**BTC** (cripto)");
    expect(md).toContain("₡1.500.000");
    expect(md).toContain("100% del portafolio");
    expect(md).toContain("concentración **alta**");
    expect(md).toContain("35%");
  });

  it("usa la moneda que se le pasa (visualización), sin equivalencias inventadas", () => {
    const usd = render(
      ctx({ holdings: [holding()], investmentValue: 1_500_000 }),
      tool({ currency: "USD" }),
    );
    expect(usd).toContain("$1.500.000");
    expect(usd).not.toContain("₡");
  });
});

describe("renderEvidenceReport · precio no disponible en la posición más grande", () => {
  const md = render(
    ctx({
      holdings: [
        holding({ symbol: "KMNO", value: 3_000_000, invested: 3_000_000, pl: 0, plPct: 0, price: null, priceUnavailable: true }),
        holding({ symbol: "VOO", assetType: "etf", value: 1_000_000, invested: 800_000, pl: 200_000, plPct: 0.25 }),
      ],
      investmentValue: 4_000_000,
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
          holding({ currency: "USD", value: 3_000_000 }),
          holding({ symbol: "CERT", assetType: "otro", currency: "CRC", value: 1_000_000 }),
        ],
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
