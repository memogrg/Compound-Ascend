import { describe, it, expect } from "vitest";
import {
  debtLevers,
  goalLevers,
  monthsBetween,
  protectionLevers,
  prioritySignal,
  expenseSobresLevers,
  debtProjections,
  fundEta,
  nextLevelProjection,
  addMonthsISO,
  detectMencionSobre,
} from "@/lib/ai/context-levers";

const d = (over: Partial<Parameters<typeof debtLevers>[0][number]> = {}) => ({
  name: "Deuda",
  liveBalance: 100_000,
  apr: 20,
  minPayment: 5_000,
  currency: "CRC",
  ...over,
});

describe("debtLevers", () => {
  it("monthlyInterestCost = round(saldo × apr/100 / 12)", () => {
    const { debts } = debtLevers([d({ liveBalance: 800_000, apr: 40 })]);
    // 800000 × 0.40 / 12 = 26 666,67 → 26 667
    expect(debts[0]!.monthlyInterestCost).toBe(26_667);
  });
  it("apr null o 0 → interés 0 (no hay costo que atacar)", () => {
    expect(debtLevers([d({ apr: null })]).debts[0]!.monthlyInterestCost).toBe(0);
    expect(debtLevers([d({ apr: 0 })]).debts[0]!.monthlyInterestCost).toBe(0);
  });
  it("ordena por costo de interés desc", () => {
    const { debts } = debtLevers([
      d({ name: "A", liveBalance: 1_000_000, apr: 5 }), // interés ~4.167
      d({ name: "B", liveBalance: 300_000, apr: 40 }), // interés ~10.000
      d({ name: "C", liveBalance: 200_000, apr: 40 }), // interés ~6.667
    ]);
    expect(debts.map((x) => x.name)).toEqual(["B", "C", "A"]);
  });
  it("desempata por saldo cuando el interés es igual", () => {
    const { debts } = debtLevers([
      d({ name: "Chica", liveBalance: 240_000, apr: 40 }), // interés 8.000
      d({ name: "Grande", liveBalance: 480_000, apr: 20 }), // interés 8.000
    ]);
    expect(debts.map((x) => x.name)).toEqual(["Grande", "Chica"]); // mismo interés → mayor saldo primero
  });
  it("filtra deudas saldadas (≤0.5) — no son palanca", () => {
    const { debts } = debtLevers([
      d({ name: "Viva", liveBalance: 500 }),
      d({ name: "Saldada", liveBalance: 0 }),
    ]);
    expect(debts.map((x) => x.name)).toEqual(["Viva"]);
  });
  it("topN + moreCount", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      d({ name: `D${i}`, liveBalance: (i + 1) * 100_000, apr: 30 }),
    );
    const { debts, moreCount } = debtLevers(many, 6);
    expect(debts.length).toBe(6);
    expect(moreCount).toBe(2);
  });
  it("redondea saldo y mínimo; preserva moneda y apr", () => {
    const { debts } = debtLevers([
      d({ liveBalance: 100_000.7, minPayment: 4_999.4, currency: "USD", apr: 18 }),
    ]);
    expect(debts[0]).toMatchObject({
      liveBalance: 100_001,
      minPayment: 4_999,
      currency: "USD",
      apr: 18,
    });
  });
});

describe("monthsBetween (timezone-safe, sobre ISO)", () => {
  it("meses enteros exactos", () => {
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-01-01")).toBe(0);
  });
  it("no cuenta el mes en curso hasta cumplir el día", () => {
    expect(monthsBetween("2026-01-15", "2026-04-10")).toBe(2); // 3 meses cal, pero 10<15 → 2
    expect(monthsBetween("2026-01-15", "2026-04-20")).toBe(3);
  });
  it("negativo si toISO ya pasó; NaN si es inválida", () => {
    expect(monthsBetween("2026-06-01", "2026-01-01")).toBe(-5);
    expect(Number.isNaN(monthsBetween("2026-06-01", "no-fecha"))).toBe(true);
  });
});

describe("goalLevers", () => {
  const g = (over: Partial<Parameters<typeof goalLevers>[0][number]> = {}) => ({
    name: "Meta",
    targetAmount: 1_200_000,
    currentAmount: 0,
    monthlyContribution: 50_000,
    targetDate: "2027-01-01" as string | null,
    currency: "CRC",
    ...over,
  });
  const TODAY = "2026-01-01"; // 12 meses a 2027-01-01

  it("monthlyRequired = ceil(gap / meses restantes); onTrack compara con el aporte", () => {
    const { goals } = goalLevers([g({ monthlyContribution: 50_000 })], TODAY);
    expect(goals[0]!.monthlyRequired).toBe(100_000); // 1.2M / 12
    expect(goals[0]!.onTrack).toBe(false); // 50k < 100k
    expect(goalLevers([g({ monthlyContribution: 120_000 })], TODAY).goals[0]!.onTrack).toBe(true);
  });
  it("sin targetDate → monthlyRequired y onTrack undefined (no hay ritmo objetivo)", () => {
    const { goals } = goalLevers([g({ targetDate: null })], TODAY);
    expect(goals[0]!.monthlyRequired).toBeUndefined();
    expect(goals[0]!.onTrack).toBeUndefined();
  });
  it("etaAtPace: al ritmo actual, cuándo llega (independiente de la fecha objetivo)", () => {
    // gap = 1.200.000 − 0 = 1.200.000; a 50.000/mes = 24 meses → enero 2028 desde enero 2026.
    const { goals } = goalLevers([g({ currentAmount: 0, monthlyContribution: 50_000 })], TODAY);
    expect(goals[0]!.monthsAtPace).toBe(24);
    expect(goals[0]!.etaAtPace).toBe("enero 2028");
  });
  it("etaAtPace undefined si no hay aporte o ya está cubierta", () => {
    expect(goalLevers([g({ monthlyContribution: 0 })], TODAY).goals[0]!.etaAtPace).toBeUndefined();
    expect(
      goalLevers([g({ currentAmount: 1_200_000 })], TODAY).goals[0]!.etaAtPace,
    ).toBeUndefined();
  });
  it("fecha vencida → vencida=true, monthlyRequired = todo el faltante", () => {
    const { goals } = goalLevers([g({ targetDate: "2025-06-01", currentAmount: 200_000 })], TODAY);
    expect(goals[0]!.vencida).toBe(true);
    expect(goals[0]!.monthlyRequired).toBe(1_000_000); // 1.2M − 200k
    expect(goals[0]!.onTrack).toBe(false);
  });
  it("filtra sobres (targetAmount ≤ 0) — no son palanca", () => {
    const { goals } = goalLevers(
      [g({ name: "Meta" }), g({ name: "Sobre", targetAmount: 0 })],
      TODAY,
    );
    expect(goals.map((x) => x.name)).toEqual(["Meta"]);
  });
  it("ordena por atraso (shortfall) desc", () => {
    const { goals } = goalLevers(
      [
        g({ name: "AlDia", monthlyContribution: 100_000 }), // req 100k, shortfall 0
        g({ name: "Atrasada", monthlyContribution: 10_000 }), // req 100k, shortfall 90k
      ],
      TODAY,
    );
    expect(goals.map((x) => x.name)).toEqual(["Atrasada", "AlDia"]);
  });
});

describe("protectionLevers", () => {
  it("mapea type/severity/description y DESCARTA recommendation (copy de UI)", () => {
    const gaps = [
      {
        type: "Seguro de invalidez",
        severity: "alto" as const,
        description: "vivís de tu ingreso",
        recommendation: "cotizá ya",
      },
    ];
    expect(protectionLevers(gaps)).toEqual([
      { type: "Seguro de invalidez", severity: "alto", description: "vivís de tu ingreso" },
    ]);
  });
});

describe("addMonthsISO (tz-safe, hacia adelante)", () => {
  it("suma meses con rollover de año y devuelve 'mes año'", () => {
    expect(addMonthsISO("2026-08-27", 0)).toBe("agosto 2026");
    expect(addMonthsISO("2026-08-27", 5)).toBe("enero 2027");
    expect(addMonthsISO("2026-01-15", 12)).toBe("enero 2027");
  });
  it("fecha inválida → ''", () => {
    expect(addMonthsISO("no-fecha", 3)).toBe("");
  });
});

describe("fundEta (horizonte del fondo a tu flujo libre, del engine)", () => {
  it("ETA = ceil(gap/aporte) + etiqueta de fecha", () => {
    // gap = 900.000 − 0 = 900.000; a 50.000/mes = 18 meses → feb 2028 desde ago 2026.
    const e = fundEta({ current: 0, target: 900_000 }, 50_000, "2026-08-27", "CRC");
    expect(e).toBeDefined();
    expect(e!.monthsToTarget).toBe(18);
    expect(e!.aporte).toBe(50_000);
    expect(e!.etaLabel).toBe("febrero 2028");
  });
  it("fondo cubierto (gap ≤ 0) → undefined", () => {
    expect(
      fundEta({ current: 900_000, target: 900_000 }, 50_000, "2026-08-27", "CRC"),
    ).toBeUndefined();
  });
  it("sin aporte (≤0) → undefined (no hay ritmo)", () => {
    expect(fundEta({ current: 0, target: 900_000 }, 0, "2026-08-27", "CRC")).toBeUndefined();
  });
});

describe("debtProjections (horizonte MENTOR del engine de amortización)", () => {
  const tarjeta = {
    name: "Tarjeta Oro",
    liveBalance: 778_257,
    apr: 40,
    minPayment: 30_000,
    currency: "CRC",
  };
  it("con extra positivo: saldás antes y ahorrás interés (del engine, no inventado)", () => {
    const [p] = debtProjections([tarjeta], 120_000);
    expect(p).toBeDefined();
    expect(p!.name).toBe("Tarjeta Oro");
    expect(p!.extra).toBe(120_000);
    expect(p!.monthsSaved).toBeGreaterThan(0);
    expect(p!.interestSaved).toBeGreaterThan(0);
  });
  it("extra 0 o negativo → no hay proyección (no hay extra que aplicar)", () => {
    expect(debtProjections([tarjeta], 0)).toEqual([]);
    expect(debtProjections([tarjeta], -50_000)).toEqual([]);
  });
  it("deuda saldada (≤0.5) → descartada", () => {
    expect(debtProjections([{ ...tarjeta, liveBalance: 0 }], 120_000)).toEqual([]);
  });
  it("cuota que NO cubre el interés mensual → descartada (la base no amortizaría)", () => {
    // interés mensual = 778257·40%/12 ≈ 25.942; una cuota de 20.000 no lo cubre.
    expect(debtProjections([{ ...tarjeta, minPayment: 20_000 }], 120_000)).toEqual([]);
  });
  it("deuda a 0% APR: proyecta meses igual, interés ahorrado 0", () => {
    const [p] = debtProjections(
      [{ name: "T0", liveBalance: 700_000, apr: 0, minPayment: 50_000, currency: "CRC" }],
      50_000,
    );
    expect(p!.monthsSaved).toBeGreaterThan(0);
    expect(p!.interestSaved).toBe(0);
  });
});

describe("detectMencionSobre (context-salience — nombre exacto, sin sinónimos)", () => {
  const sobres = [
    { name: "Restaurantes", monthly: 80_000 },
    { name: "Súper", monthly: 300_000 },
  ];
  it("matchea el sobre nombrado por su nombre exacto (sin acentos, case-insensitive)", () => {
    expect(detectMencionSobre("gasto un montón en RESTAURANTES y no lo dejo", sobres)?.name).toBe(
      "Restaurantes",
    );
    expect(detectMencionSobre("me voy al super de nuevo", sobres)?.name).toBe("Súper");
  });
  it("sin mención de un sobre → undefined (no inventa)", () => {
    expect(detectMencionSobre("¿cómo voy este mes?", sobres)).toBeUndefined();
  });
  it("NO matchea sinónimos (solo el nombre del sobre)", () => {
    expect(detectMencionSobre("gasto mucho en comer afuera", sobres)).toBeUndefined();
  });
  it("si nombra varios, devuelve el MÁS pesado (mueve más la aguja)", () => {
    expect(detectMencionSobre("gasto en restaurantes y en el super", sobres)?.name).toBe("Súper");
  });
  it("sin sobres o mensaje vacío → undefined", () => {
    expect(detectMencionSobre("restaurantes", undefined)).toBeUndefined();
    expect(detectMencionSobre("", sobres)).toBeUndefined();
  });
});

describe("expenseSobresLevers", () => {
  it("ordena por gasto real desc, redondea y cap topN", () => {
    const top = expenseSobresLevers(
      [
        { name: "Restaurantes", monthly: 120_000.4 },
        { name: "Súper", monthly: 300_000 },
        { name: "Transporte", monthly: 45_000 },
      ],
      2,
    );
    expect(top).toEqual([
      { name: "Súper", monthly: 300_000 },
      { name: "Restaurantes", monthly: 120_000 },
    ]);
  });
  it("descarta sobres en 0 y de nombre vacío", () => {
    const top = expenseSobresLevers([
      { name: "Restaurantes", monthly: 80_000 },
      { name: "Cero", monthly: 0 },
      { name: "  ", monthly: 50_000 },
    ]);
    expect(top.map((s) => s.name)).toEqual(["Restaurantes"]);
  });
});

describe("prioritySignal (reusa el Priority Engine canónico)", () => {
  const debt = {
    name: "Tarjeta Oro",
    liveBalance: 800_000,
    apr: 40,
    minPayment: 30_000,
    currency: "CRC",
    monthlyInterestCost: 26_667,
  };

  it("engine no-verde + nextBestAction de deuda → enriquece con el costo real de la deuda", () => {
    const s = prioritySignal({
      diagnosis: { semaforo: "rojo", nextBestAction: "Paga extra a tu deuda más cara." },
      debts: [debt],
    });
    expect(s).toContain("Tarjeta Oro al 40%");
    expect(s).toContain("26667");
    expect(s).toContain("Paga extra a tu deuda más cara."); // conserva la decisión canónica
  });
  it("engine no-verde + prioridad NO-deuda (fondo) → devuelve el nextBestAction tal cual", () => {
    const s = prioritySignal({
      diagnosis: {
        semaforo: "amarillo",
        nextBestAction: "Automatiza un aporte a tu fondo de emergencia.",
      },
      debts: [],
    });
    expect(s).toBe("Automatiza un aporte a tu fondo de emergencia.");
  });
  it("engine VERDE sin alerta → undefined (sano de verdad)", () => {
    expect(
      prioritySignal({
        diagnosis: { semaforo: "verde", nextBestAction: "Aumenta el aporte.", alerts: [] },
      }),
    ).toBeUndefined();
  });
  it("gate fix: VERDE pero con ALERTA (fondo vacío) → SÍ dispara el nextBestAction del engine", () => {
    const s = prioritySignal({
      diagnosis: {
        semaforo: "verde",
        nextBestAction: "Automatiza un aporte a tu fondo de emergencia.",
        alerts: ["Tu fondo de emergencia aún no está construido; es tu primera red de seguridad."],
      },
    });
    expect(s).toBe("Automatiza un aporte a tu fondo de emergencia.");
  });
  it("sin diagnóstico → fallback al insight 'accionar' (ya ordenado por severidad)", () => {
    const s = prioritySignal({
      insights: [
        { severity: "info", title: "algo menor" },
        {
          severity: "accionar",
          title: "Sobre Restaurantes sobregirado",
          action: "ajustar presupuesto",
        },
      ],
    });
    expect(s).toBe("Sobre Restaurantes sobregirado — ajustar presupuesto");
  });
  it("sin diagnóstico y sin insight 'accionar' → undefined (lidera con highlight)", () => {
    expect(
      prioritySignal({ insights: [{ severity: "celebrar", title: "racha" }] }),
    ).toBeUndefined();
    expect(prioritySignal({})).toBeUndefined();
  });
});

describe("nextLevelProjection · próximo nivel (Paso 3.12, reusa projectInvestment)", () => {
  it("con superávit computa el valor a 10 años + rendimiento (grounded del engine)", () => {
    const out = nextLevelProjection(1_000_000, 550_000, "CRC");
    expect(out).toBeDefined();
    expect(out!.aporte).toBe(550_000);
    expect(out!.years).toBe(10);
    // 550k/mes × 120 = 66M aportado + 1M inicial → VF > total aportado; rendimiento > 0.
    expect(out!.futureValue).toBeGreaterThan(67_000_000);
    expect(out!.interestEarned).toBeGreaterThan(0);
    // interés = VF − (inicial + aporte×120), coherente (no inventado).
    expect(out!.interestEarned).toBe(out!.futureValue - (1_000_000 + 550_000 * 120));
    expect(out!.currency).toBe("CRC");
  });
  it("sin flujo libre (aporte ≤ 0) → undefined (no fuerza acción falsa)", () => {
    expect(nextLevelProjection(1_000_000, 0, "CRC")).toBeUndefined();
    expect(nextLevelProjection(1_000_000, -5000, "CRC")).toBeUndefined();
  });
  it("sin capital inicial igual proyecta el stream de aportes", () => {
    const out = nextLevelProjection(0, 100_000, "CRC");
    expect(out).toBeDefined();
    expect(out!.futureValue).toBeGreaterThan(100_000 * 120); // compone por encima de lo aportado
  });
});
