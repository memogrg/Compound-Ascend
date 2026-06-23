import { describe, it, expect } from "vitest";
import {
  computePatrimonio,
  patrimonioLevel,
  millonarioReadings,
  buildPatrimonioDiagnosis,
  type PatrimonioInput,
} from "@/modules/wealth/engine/patrimonio-engine";

/** Input con todo en cero salvo lo que cada test sobreescribe. */
const inp = (o: Partial<PatrimonioInput>): PatrimonioInput => ({
  assetsByClass: { liquido: 0, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 },
  totalLiabilities: 0,
  protectedCoverage: 0,
  protectionScore: 0,
  monthlyExpenses: 0,
  passiveIncomeMonthly: 0,
  netMonthlyIncome: 0,
  monthlyInvested: 0,
  badDebtMonthlyPayment: 0,
  diversification: "baja",
  topConcentration: 0,
  currency: "CRC",
  ...o,
});

const codes = (r: ReturnType<typeof computePatrimonio>) =>
  buildPatrimonioDiagnosis(r).map((f) => f.code);

describe("computePatrimonio · totales y ajustado", () => {
  it("totalAssets, netWorth y adjustedNetWorth", () => {
    const r = computePatrimonio(
      inp({ assetsByClass: { liquido: 100, inversion: 200, productivo: 300, uso_personal: 400, especial: 500 }, totalLiabilities: 100 }),
    );
    expect(r.totalAssets).toBe(1500);
    expect(r.netWorth).toBe(1400);
    // 100*1 + 200*.95 + 300*.8 + 400*.65 + 500*.55 = 100+190+240+260+275 = 1065; −100 = 965
    expect(r.adjustedNetWorth).toBe(965);
  });

  it("descuentos: efectivo 100% vs especial 55%", () => {
    expect(computePatrimonio(inp({ assetsByClass: { liquido: 100000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 } })).adjustedNetWorth).toBe(100000);
    expect(computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 0, productivo: 0, uso_personal: 0, especial: 100000 } })).adjustedNetWorth).toBe(55000);
  });
});

describe("computePatrimonio · personas del PDF (A vs B)", () => {
  // Mismo gasto; A: 1.000.000 totales pero solo 50.000 invertible. B: 600.000 totales con 450.000 invertible.
  const A = computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 50_000, productivo: 0, uso_personal: 950_000, especial: 0 }, monthlyExpenses: 5_000 }));
  const B = computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 450_000, productivo: 0, uso_personal: 150_000, especial: 0 }, monthlyExpenses: 5_000 }));

  it("A tiene años de libertad e índice bajos pese a mayor patrimonio total", () => {
    expect(A.totalAssets).toBe(1_000_000);
    expect(A.añosDeLibertad).toBeLessThan(1); // 50.000 / 60.000
    expect(A.indice).toBeLessThan(B.indice);
  });

  it("B supera a A en ratioLibertad e índice pese a menor patrimonio total", () => {
    expect(B.totalAssets).toBe(600_000);
    expect(B.ratioLibertad).toBeGreaterThan(A.ratioLibertad);
    expect(B.indice).toBeGreaterThan(A.indice);
  });
});

describe("computePatrimonio · años de libertad", () => {
  it("invertible 600.000 / gasto anual 120.000 = 5", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 600_000, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 10_000 }));
    expect(r.añosDeLibertad).toBe(5);
  });
  it("invertible 600.000 / gasto anual 24.000 = 25", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 600_000, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 2_000 }));
    expect(r.añosDeLibertad).toBe(25);
  });
});

describe("patrimonioLevel · bordes de cada rango", () => {
  const name = (i: number) => patrimonioLevel(i).name;
  it("mapea cada borde al nivel correcto", () => {
    expect(name(0)).toBe("Punto de partida");
    expect(name(15)).toBe("Punto de partida");
    expect(name(16)).toBe("Base en construcción");
    expect(name(30)).toBe("Base en construcción");
    expect(name(31)).toBe("Estabilidad inicial");
    expect(name(45)).toBe("Estabilidad inicial");
    expect(name(46)).toBe("Constructor patrimonial");
    expect(name(60)).toBe("Constructor patrimonial");
    expect(name(61)).toBe("Patrimonio sólido");
    expect(name(75)).toBe("Patrimonio sólido");
    expect(name(76)).toBe("Alta independencia");
    expect(name(90)).toBe("Alta independencia");
    expect(name(91)).toBe("Libertad patrimonial");
    expect(name(100)).toBe("Libertad patrimonial");
  });
});

describe("millonarioReadings", () => {
  it("patrimonio invertible y flujo cubren todas las lecturas", () => {
    const m = millonarioReadings(inp({ assetsByClass: { liquido: 0, inversion: 1_500_000, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 1_000, passiveIncomeMonthly: 1_200 }));
    expect(m).toEqual({ nominal: true, netWorth: true, invertible: true, libertad: true, flujo: true });
  });
  it("perfil bajo → todas falsas", () => {
    const m = millonarioReadings(inp({ assetsByClass: { liquido: 1_000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 1_000 }));
    expect(m).toEqual({ nominal: false, netWorth: false, invertible: false, libertad: false, flujo: false });
  });
});

describe("buildPatrimonioDiagnosis · banderas §15", () => {
  it("patrimonio_neto_negativo (pasivos > activos)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 1_000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 }, totalLiabilities: 5_000 }));
    expect(r.netWorth).toBe(-4_000);
    expect(codes(r)).toContain("patrimonio_neto_negativo");
  });

  it("patrimonio_alto_baja_liquidez (sustancial pero <3 meses)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 0, inversion: 200_000, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 1_000 }));
    expect(codes(r)).toContain("patrimonio_alto_baja_liquidez");
  });

  it("alto_pero_poco_productivo (sustancial, invertible <30%)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 3_000, inversion: 0, productivo: 0, uso_personal: 200_000, especial: 0 }, monthlyExpenses: 1_000 }));
    const c = codes(r);
    expect(c).toContain("alto_pero_poco_productivo");
    expect(c).not.toContain("patrimonio_alto_baja_liquidez"); // 3 meses justos, no <3
  });

  it("alta_tasa_baja_proteccion (tasa>=15%, protección<50)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 3_000, inversion: 0, productivo: 0, uso_personal: 20_000, especial: 0 }, monthlyExpenses: 1_000, netMonthlyIncome: 1_000, monthlyInvested: 200, protectionScore: 10 }));
    expect(codes(r)).toContain("alta_tasa_baja_proteccion");
  });

  it("deuda_mala_alta (pago deuda cara >=20% ingreso)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 3_000, inversion: 0, productivo: 0, uso_personal: 20_000, especial: 0 }, monthlyExpenses: 1_000, netMonthlyIncome: 1_000, badDebtMonthlyPayment: 300 }));
    expect(codes(r)).toContain("deuda_mala_alta");
  });

  it("alta_concentracion (topConcentration >=0.6)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 3_000, inversion: 0, productivo: 0, uso_personal: 20_000, especial: 0 }, monthlyExpenses: 1_000, topConcentration: 0.7 }));
    expect(codes(r)).toContain("alta_concentracion");
  });

  it("alto_gasto_vs_patrimonio (gasto anual > patrimonio neto)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 5_000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 1_000 }));
    expect(codes(r)).toContain("alto_gasto_vs_patrimonio");
  });
});

describe("computePatrimonio · bordes", () => {
  it("gasto 0 → sin división por cero (índice finito, métricas 0)", () => {
    const r = computePatrimonio(inp({ assetsByClass: { liquido: 10_000, inversion: 5_000, productivo: 0, uso_personal: 0, especial: 0 }, monthlyExpenses: 0 }));
    expect(Number.isFinite(r.indice)).toBe(true);
    expect(r.mesesDeLibertad).toBe(0);
    expect(r.coberturaPasiva).toBe(0);
    expect(r.numeroDeLibertad).toBe(0);
    expect(r.ratioLibertad).toBe(0);
    expect(r.añosDeLibertad).toBe(0);
  });

  it("patrimonioEsperado y ratioAcumulacion (§10.2) — null si falta edad/ingreso", () => {
    const conEdad = computePatrimonio(inp({ assetsByClass: { liquido: 500_000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 }, age: 40, annualNetIncome: 250_000 }));
    expect(conEdad.patrimonioEsperado).toBe(1_000_000); // 40*250000/10
    expect(conEdad.ratioAcumulacion).toBe(0.5); // 500000 / 1.000.000
    const sinEdad = computePatrimonio(inp({ assetsByClass: { liquido: 500_000, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 } }));
    expect(sinEdad.patrimonioEsperado).toBeNull();
    expect(sinEdad.ratioAcumulacion).toBeNull();
  });
});
