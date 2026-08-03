/**
 * Cobertura de "daño": los detectores que le dan al asesor algo real que señalar.
 * Todos puros y deterministas — se prueban con datos, no con IO.
 *
 * Además del caso que dispara, cada uno prueba el que NO dispara: un detector que grita de más
 * es peor que uno que no existe, porque convierte al asesor en naggy.
 */
import { describe, it, expect } from "vitest";

import {
  detectOverspentEnvelopes,
  detectLowSavingsRate,
  detectExpensiveDebt,
  detectEmergencyFundGap,
  detectConcentration,
  detectReturnBelowInflation,
  APR_CARO,
} from "@/lib/insights/detectors";
import { suggestedAction } from "@/lib/insights/actions";
import type { Debt } from "@/modules/control/types";

const debt = (over: Partial<Debt>): Debt =>
  ({
    id: "d1",
    name: "Tarjeta",
    balance: 1_000_000,
    minPayment: 50_000,
    currentPayment: 50_000,
    apr: 45,
    currency: "CRC",
    isCurrent: true,
    ...over,
  }) as Debt;

describe("detectOverspentEnvelopes · sobres pasados de presupuesto", () => {
  const sobres = [
    { categoryId: "c1", path: "Vivir › Restaurantes", budget: 100_000, spent: 140_000 },
    // 7,5% de exceso: pasa el piso de ruido (5%) pero no llega al 20% de "accionar".
    { categoryId: "c2", path: "Vivir › Súper", budget: 200_000, spent: 215_000 },
    { categoryId: "c3", path: "Vivir › Transporte", budget: 80_000, spent: 60_000 },
  ];

  it("emite solo los excedidos, del peor al menor", () => {
    const out = detectOverspentEnvelopes({ sobres, currency: "CRC" });
    expect(out).toHaveLength(2);
    expect(out[0]?.relatedId).toBe("c1"); // ₡40.000 de exceso, el peor
    expect(out[1]?.relatedId).toBe("c2");
    expect(out.map((i) => i.kind)).toEqual(["sobre_sobregirado", "sobre_sobregirado"]);
  });

  it("pasarse un quinto es accionable; pasarse poco solo se observa", () => {
    const out = detectOverspentEnvelopes({ sobres, currency: "CRC" });
    expect(out[0]?.severity).toBe("accionar"); // 40%
    expect(out[1]?.severity).toBe("observar"); // 5%
  });

  it("ignora el ruido de centavos (menos del 5%) y los sobres sin presupuesto", () => {
    const out = detectOverspentEnvelopes({
      sobres: [
        { categoryId: "c1", path: "x", budget: 100_000, spent: 102_000 }, // 2%
        { categoryId: "c2", path: "y", budget: 0, spent: 50_000 }, // sin presupuesto
      ],
      currency: "CRC",
    });
    expect(out).toHaveLength(0);
  });

  it("topea la cantidad: la campana no se vuelve una lista de reproches", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({
      categoryId: `c${i}`,
      path: `sobre ${i}`,
      budget: 100_000,
      spent: 200_000,
    }));
    expect(detectOverspentEnvelopes({ sobres: muchos, currency: "CRC" })).toHaveLength(2);
    expect(detectOverspentEnvelopes({ sobres: muchos, currency: "CRC", max: 3 })).toHaveLength(3);
  });

  it("relatedId es la categoría → se auto-resuelve cuando el sobre vuelve a su presupuesto", () => {
    const out = detectOverspentEnvelopes({ sobres, currency: "CRC" });
    expect(out[0]?.relatedKind).toBe("category");
    expect(out[0]?.relatedId).toBe("c1");
  });
});

describe("detectLowSavingsRate · tasa de ahorro baja o negativa", () => {
  it("negativa: gasta más de lo que entra → accionar", () => {
    const out = detectLowSavingsRate({
      savingsRate: -0.12,
      incomeMonthly: 1_000_000,
      freeCashflow: -120_000,
      currency: "CRC",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("accionar");
    expect(out[0]?.title).toMatch(/más de lo que entra/i);
  });

  it("baja pero positiva → observar, con el porcentaje real", () => {
    const out = detectLowSavingsRate({
      savingsRate: 0.04,
      incomeMonthly: 1_000_000,
      freeCashflow: 40_000,
      currency: "CRC",
    });
    expect(out[0]?.severity).toBe("observar");
    expect(out[0]?.title).toContain("4%");
  });

  it("sana (≥10%) → no dice nada", () => {
    expect(
      detectLowSavingsRate({
        savingsRate: 0.22,
        incomeMonthly: 1_000_000,
        freeCashflow: 220_000,
        currency: "CRC",
      }),
    ).toHaveLength(0);
  });

  it("sin ingreso registrado NO afirma nada (no es que ahorre mal: no hay dato)", () => {
    expect(
      detectLowSavingsRate({ savingsRate: 0, incomeMonthly: 0, freeCashflow: 0, currency: "CRC" }),
    ).toHaveLength(0);
  });
});

describe("detectExpensiveDebt · deuda cara por TASA", () => {
  it("emite UNA sola: la de tasa más alta", () => {
    const out = detectExpensiveDebt([
      debt({ id: "a", name: "Tarjeta A", apr: 38 }),
      debt({ id: "b", name: "Tarjeta B", apr: 52 }),
      debt({ id: "c", name: "Hipoteca", apr: 9 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.relatedId).toBe("b");
    expect(out[0]?.metric).toBe(52);
    expect(out[0]?.severity).toBe("accionar");
  });

  it("no dispara con deuda barata ni sin tasa registrada", () => {
    expect(detectExpensiveDebt([debt({ apr: 9 })])).toHaveLength(0);
    expect(detectExpensiveDebt([debt({ apr: null })])).toHaveLength(0);
  });

  it("ignora deudas ya saldadas (saldo 0)", () => {
    expect(detectExpensiveDebt([debt({ apr: 60, balance: 0 })])).toHaveLength(0);
  });

  it("el umbral es configurable y por defecto es APR_CARO", () => {
    expect(detectExpensiveDebt([debt({ apr: APR_CARO })])).toHaveLength(1);
    expect(detectExpensiveDebt([debt({ apr: 15 })], 10)).toHaveLength(1);
  });
});

describe("detectEmergencyFundGap · el fondo base", () => {
  it("incompleto → accionar, con lo que lleva y lo que falta por mes", () => {
    const out = detectEmergencyFundGap({
      covered: false,
      current: 200_000,
      target: 500_000,
      recommendedMonthly: 50_000,
      currency: "CRC",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("accionar");
    expect(out[0]?.metric).toBe(300_000);
    expect(out[0]?.body).toMatch(/50/); // la cuota sugerida aparece
  });

  it("cubierto → silencio (de eso se encarga el fondo de paz)", () => {
    expect(
      detectEmergencyFundGap({
        covered: true,
        current: 500_000,
        target: 500_000,
        recommendedMonthly: 0,
        currency: "CRC",
      }),
    ).toHaveLength(0);
  });

  it("sin objetivo definido no inventa una brecha", () => {
    expect(
      detectEmergencyFundGap({
        covered: false,
        current: 0,
        target: 0,
        recommendedMonthly: 0,
        currency: "CRC",
      }),
    ).toHaveLength(0);
  });
});

describe("detectConcentration · una posición pesa demasiado", () => {
  it("por encima del umbral → observar (es riesgo, no un error)", () => {
    const out = detectConcentration({
      slices: [
        { label: "BTC", pct: 0.72 },
        { label: "VOO", pct: 0.28 },
      ],
      totalValue: 5_000_000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("observar");
    expect(out[0]?.metric).toBe(72);
    expect(out[0]?.title).toContain("BTC");
  });

  it("bien repartido → no dice nada", () => {
    expect(
      detectConcentration({
        slices: [
          { label: "A", pct: 0.4 },
          { label: "B", pct: 0.35 },
          { label: "C", pct: 0.25 },
        ],
        totalValue: 1_000,
      }),
    ).toHaveLength(0);
  });

  it("con UNA sola posición no hay concentración que señalar (es arrancar, no un error)", () => {
    expect(
      detectConcentration({ slices: [{ label: "BTC", pct: 1 }], totalValue: 100_000 }),
    ).toHaveLength(0);
  });

  it("sin portafolio no dispara", () => {
    expect(detectConcentration({ slices: [], totalValue: 0 })).toHaveLength(0);
  });
});

describe("detectReturnBelowInflation · el poder de compra", () => {
  it("rinde menos que la inflación → observar, con AMBAS cifras y sin inventar un 'real'", () => {
    const out = detectReturnBelowInflation({
      returnPct: 0.02,
      inflationPct: 0.06,
      totalValue: 3_000_000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toContain("2%");
    expect(out[0]?.body).toContain("6%");
    // No se afirma una resta entre unidades distintas (acumulado vs interanual).
    expect(out[0]?.body).not.toMatch(/rendimiento real/i);
  });

  it("le gana a la inflación → silencio", () => {
    expect(
      detectReturnBelowInflation({ returnPct: 0.12, inflationPct: 0.06, totalValue: 3_000_000 }),
    ).toHaveLength(0);
  });

  it("sin portafolio o sin dato de inflación no afirma nada", () => {
    expect(
      detectReturnBelowInflation({ returnPct: -0.3, inflationPct: 0.06, totalValue: 0 }),
    ).toHaveLength(0);
    expect(
      detectReturnBelowInflation({ returnPct: -0.3, inflationPct: 0, totalValue: 3_000_000 }),
    ).toHaveLength(0);
  });
});

describe("suggestedAction · toda observación tiene una salida concreta", () => {
  const kinds = [
    "sobre_sobregirado",
    "ahorro_bajo",
    "deuda_cara",
    "fondo_emergencia",
    "concentracion_inversion",
    "rendimiento_bajo_inflacion",
    "gasto_disfrute_alza",
  ] as const;

  it("cada tipo de daño sabe cómo se arregla y adónde ir", () => {
    for (const k of kinds) {
      const a = suggestedAction(k);
      expect(a, k).toBeDefined();
      expect(a?.label.length, k).toBeGreaterThan(0);
      expect(a?.route.startsWith("/"), k).toBe(true);
    }
  });

  it("la ruta apunta al módulo que resuelve el problema", () => {
    expect(suggestedAction("deuda_cara")?.route).toBe("/deudas");
    expect(suggestedAction("sobre_sobregirado")?.route).toBe("/gastos");
    expect(suggestedAction("fondo_emergencia")?.route).toBe("/patrimonio/proteccion");
  });
});
