import { describe, it, expect } from "vitest";
import { renderSurplusDecision } from "@/lib/ai/surplus-render";
import { compareSurplus, ASSET_HISTORY } from "@/modules/wealth/engine/surplus-decision";
import { formatMoney } from "@/lib/format";
import type { SurplusDecisionReport } from "@/modules/wealth/services/surplus-decision-service";

// COMPARADOR ABONAR vs INVERTIR: el render es PURO y no calcula nada — todas las cifras salen de
// compareSurplus. Lo que se prueba acá es la disciplina del producto: nunca una línea única (tres
// escenarios), la caída máxima SIEMPRE visible, el gate de deuda cara, y la precondición de los
// fondos de defensa. La app informa, no ordena.

const reporte = (over: Partial<SurplusDecisionReport> = {}): SurplusDecisionReport => {
  const base = compareSurplus({
    monthlySurplus: 200_000,
    horizonYears: 10,
    apr: 0.08,
    pay: { interestSaved: 4_500_000, monthsSaved: 38 },
  });
  return { ...base, currency: "CRC", fundsCovered: true, debtName: "Hipoteca", ...over };
};

describe("renderSurplusDecision · precondición de los fondos de defensa", () => {
  const md = renderSurplusDecision(reporte({ fundsCovered: false }));

  it("sin fondos cubiertos NO compara: ni un benchmark aparece", () => {
    expect(md).not.toMatch(/S&P 500/);
    expect(md).not.toMatch(/Nasdaq/);
    expect(md).not.toMatch(/Bitcoin/);
  });

  it("dice por qué y qué falta, sin regañar", () => {
    expect(md).toMatch(/DESPUÉS de cubrir tus fondos de defensa/i);
    expect(md).toMatch(/emergencia y paz/i);
    expect(md).toContain("₡200.000"); // el excedente real, del motor
    expect(md).not.toMatch(/deber[ií]as|tenés que|error/i);
  });
});

describe("renderSurplusDecision · gate de deuda cara (> 12%)", () => {
  const gatedRep = reporte({
    ...compareSurplus({
      monthlySurplus: 200_000,
      horizonYears: 10,
      apr: 0.24,
      pay: { interestSaved: 3_000_000, monthsSaved: 20 },
    }),
    currency: "CRC",
    fundsCovered: true,
    debtName: "Tarjeta BAC",
  });
  const md = renderSurplusDecision(gatedRep);

  it("con deuda por encima del umbral NO se plantea invertir (el motor vacía ese lado)", () => {
    expect(gatedRep.gated).toBe(true);
    expect(md).not.toMatch(/S&P 500/);
    expect(md).not.toMatch(/Nasdaq/);
    expect(md).not.toMatch(/Bitcoin/);
  });

  it("muestra la deuda, su tasa y el ahorro CIERTO del motor de amortización", () => {
    expect(md).toContain("Tarjeta BAC");
    expect(md).toContain("24,0%");
    expect(md).toContain("12%"); // el umbral, explícito
    expect(md).toContain("₡3.000.000"); // interés ahorrado
    expect(md).toMatch(/1 año y 8 meses/); // 20 meses, legible
    expect(md).toMatch(/retorno GARANTIZADO/i);
  });
});

describe("renderSurplusDecision · comparación completa", () => {
  const md = renderSurplusDecision(reporte());

  it("lado CERTEZA: interés y meses ahorrados, marcados como que no dependen del mercado", () => {
    expect(md).toContain("Hipoteca");
    expect(md).toContain("₡4.500.000");
    expect(md).toMatch(/3 años y 2 meses/); // 38 meses
    expect(md).toMatch(/no depende del mercado/i);
  });

  it("los TRES activos, cada uno con sus TRES escenarios (nunca una línea única)", () => {
    for (const label of ["S&P 500", "Nasdaq", "Bitcoin"]) expect(md).toContain(label);
    for (const banda of ["peor", "típico", "mejor"]) {
      // una vez por activo
      expect(md.split(banda).length - 1).toBeGreaterThanOrEqual(3);
    }
  });

  it("la caída máxima de cada activo SIEMPRE visible, con su cifra real del motor", () => {
    const dd = (n: number) => `−${(Math.abs(n) * 100).toFixed(0)}%`;
    expect(md).toContain(dd(ASSET_HISTORY.sp500.maxDrawdown)); // −57%
    expect(md).toContain(dd(ASSET_HISTORY.nasdaq.maxDrawdown)); // −78%
    expect(md).toContain(dd(ASSET_HISTORY.btc.maxDrawdown)); // −80%
    expect(md.match(/Caída máxima histórica/g)).toHaveLength(3);
  });

  it("BTC lleva su caveat de astilla; los otros no", () => {
    expect(md).toMatch(/astilla chica de la cartera/i);
    expect(md).toMatch(/ha caído más de 70%/i);
    expect(md.match(/⚠/g)).toHaveLength(1); // solo el sliver
  });

  it("cita la fuente de cada activo y cierra informando, no ordenando", () => {
    expect(md.match(/_Fuente:/g)).toHaveLength(3);
    expect(md).toMatch(/no promesas|no garantiza el futuro/i);
    expect(md).toMatch(/para que decidas vos/i);
    expect(md).not.toMatch(/deber[ií]as invertir|te recomiendo que|hacé esto/i);
  });

  it("las cifras de inversión salen del motor, no del render", () => {
    const r = reporte();
    const sp = r.invest.find((p) => p.asset === "sp500")!;
    const tipico = sp.scenarios.find((s) => s.band === "tipico")!;
    expect(renderSurplusDecision(r)).toContain(formatMoney(tipico.endValue, "CRC"));
  });
});

describe("renderSurplusDecision · sin deuda que abonar", () => {
  const sinDeuda = reporte({
    ...compareSurplus({ monthlySurplus: 150_000, horizonYears: 10, apr: null, pay: null }),
    currency: "CRC",
    fundsCovered: true,
    debtName: null,
  });
  const md = renderSurplusDecision(sinDeuda);

  it("lo dice en vez de dejar una frase rota, y el lado inversión sigue completo", () => {
    expect(md).toMatch(/no tenés deuda registrada que abonar/i);
    expect(md).toContain("S&P 500");
    expect(md).toContain("Bitcoin");
    expect(md).not.toContain("undefined");
    expect(md).not.toContain("null");
  });
});
