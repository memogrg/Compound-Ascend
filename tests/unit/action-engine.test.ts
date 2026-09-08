/**
 * Motor de "Mis acciones": el orden, las barandas y los estados.
 *
 * Lo que estos tests protegen es el invariante que da sentido a la pantalla: la prioridad
 * REORDENA y cambia el tono, pero NO cambia las reglas. Con una tarjeta al 24%, elegir «Hacer
 * crecer» no desbloquea nada — solo cambia la explicación.
 */
import { describe, it, expect } from "vitest";
import { buildActionPlan, resolveActionPriority } from "@/modules/actions/engine/action-engine";
import type { ActionEngineInput } from "@/modules/actions/engine/action-engine";
import type { ActionState } from "@/modules/actions/types";
import type { Insight } from "@/lib/insights";
import type { ControlDiagnosis, Debt, SavingsGoal } from "@/modules/control";
import type { DefenseFundsReport, SurplusDecisionReport } from "@/modules/wealth";

const HOY = "2026-09-08";
const MONEDA = "CRC";

function diagnosis(over: Partial<ControlDiagnosis> = {}): ControlDiagnosis {
  return {
    scoreControl: 50,
    semaforo: "amarillo",
    diagnosis: "",
    decision: "",
    impact: "",
    nextBestAction: "",
    allocation: [],
    goalRecs: [],
    alerts: [],
    plan30: [],
    ...over,
  };
}

function goal(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "g1",
    name: "Viaje",
    kind: "meta",
    targetAmount: 1_000_000,
    currentAmount: 100_000,
    monthlyContribution: 50_000,
    currency: MONEDA,
    status: "saludable",
    recurrence: "ninguna" as SavingsGoal["recurrence"],
    ...over,
  };
}

function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    name: "Tarjeta BAC",
    balance: 1_850_000,
    minPayment: 90_000,
    currentPayment: 120_000,
    apr: 24,
    currency: MONEDA,
    isCurrent: true,
    ...over,
  };
}

function funds(over: Partial<DefenseFundsReport> = {}): DefenseFundsReport {
  const lleno = {
    target: 500_000,
    current: 500_000,
    gap: 0,
    progressPct: 1,
    covered: true,
    recommendedMonthly: 0,
  };
  return {
    emergency: { ...lleno },
    peace: { ...lleno, months: 3, blockedByEmergency: false },
    activeFund: "done",
    horizonMonths: 12,
    currency: MONEDA,
    emergencyRegistered: true,
    peaceRegistered: true,
    emergencyCandidate: null,
    ...over,
  };
}

function surplus(over: Partial<SurplusDecisionReport> = {}): SurplusDecisionReport {
  return {
    monthlySurplus: 200_000,
    horizonYears: 5,
    apr: 0.24,
    gated: true,
    pay: { interestSaved: 640_000, monthsSaved: 14 },
    invest: [],
    currency: MONEDA,
    fundsCovered: true,
    debtName: "Tarjeta BAC",
    ...over,
  };
}

/** Escenario base: deuda al 24%, sobrante, fondos cubiertos y un insight de cada dominio. */
function input(over: Partial<ActionEngineInput> = {}): ActionEngineInput {
  const insights: Insight[] = [
    {
      id: "i-sobre",
      kind: "sobre_sobregirado",
      severity: "accionar",
      title: 'Te pasaste en "Comida"',
      body: "Llevás ₡40.000 por encima.",
      metric: 40_000,
      relatedKind: "category",
      relatedId: "cat-1",
      status: "activo",
      createdAt: HOY,
      updatedAt: HOY,
    },
    {
      id: "i-conc",
      kind: "concentracion_inversion",
      severity: "observar",
      title: "AAPL concentra el 72% de tu portafolio",
      body: "Si a esa posición le va mal, se lo lleva casi todo.",
      metric: 72,
      relatedId: "concentracion_inversion",
      status: "activo",
      createdAt: HOY,
      updatedAt: HOY,
    },
  ];
  return {
    diagnosis: diagnosis(),
    goals: [goal()],
    debts: [debt()],
    expensiveDebts: [{ id: "d1", name: "Tarjeta BAC", apr: 24, balance: 1_850_000 }],
    surplus: surplus(),
    insights,
    funds: funds(),
    freeCashflow: 200_000,
    recurringHoldings: 1,
    priorities: [],
    states: [],
    currency: MONEDA,
    today: HOY,
    compararAbono: (extra) => ({
      interestSaved: Math.round(extra * 4),
      monthsSaved: Math.round(extra / 10_000),
    }),
    payoffDate: "2029-03-01",
    ...over,
  };
}

describe("buildActionPlan · deuda cara y sobrante", () => {
  it("la hero es la acción del sobrante y las de crecer salen bloqueadas", () => {
    const plan = buildActionPlan(input(), "deudas");
    expect(plan.hero?.key).toBe("surplus:deuda:2026-09");
    expect(plan.hero?.impact.label).toContain("de interés que no pagás");

    const crecer = [plan.hero, ...plan.now, ...plan.later].filter((a) => a && a.kind === "crecer");
    expect(crecer.length).toBeGreaterThan(0);
    for (const a of crecer) {
      expect(a?.locked).toBe(true);
      expect(a?.lockReason).toContain("regla del 12%");
      expect(a?.lockReason).toContain("Tarjeta BAC");
    }
  });

  it("«Hacer crecer» NO desbloquea nada: solo cambia el orden y la nota", () => {
    const base = input();
    const deudas = buildActionPlan(base, "deudas");
    const crecer = buildActionPlan(base, "crecer");

    const bloqueadas = (p: typeof deudas) =>
      [p.hero, ...p.now, ...p.later].filter((a) => a?.locked).map((a) => a!.key);
    // Mismas acciones bloqueadas con las dos prioridades: la baranda no se negocia.
    expect(new Set(bloqueadas(crecer))).toEqual(new Set(bloqueadas(deudas)));
    // Y la hero sigue sin poder ser una acción de crecer.
    expect(crecer.hero?.locked).toBeFalsy();
    expect(crecer.hero?.kind).not.toBe("crecer");

    expect(crecer.note).not.toBe(deudas.note);
    expect(crecer.note).toContain("mejor inversión");
    expect(crecer.note).toContain("24%");
  });
});

describe("buildActionPlan · precondición de los fondos", () => {
  it("sin fondos cubiertos no hay comparación: aparece «Completá tu fondo…»", () => {
    const plan = buildActionPlan(
      input({
        surplus: surplus({ fundsCovered: false, pay: null, debtName: null }),
        funds: funds({
          activeFund: "emergency",
          emergency: {
            target: 500_000,
            current: 120_000,
            gap: 380_000,
            progressPct: 0.24,
            covered: false,
            recommendedMonthly: 31_667,
          },
        }),
      }),
      "proteger",
    );
    expect(plan.hero?.title).toContain("Completá tu fondo de emergencia");
    expect(plan.hero?.impact.kind).toBe("brecha");
    expect(plan.hero?.impact.value).toBe(380_000);
    const claves = [plan.hero, ...plan.now, ...plan.later].map((a) => a!.key);
    expect(claves).not.toContain("surplus:deuda:2026-09");
  });
});

describe("buildActionPlan · lo que la persona ya decidió", () => {
  const estado = (actionKey: string, over: Partial<ActionState>): ActionState => ({
    id: `s-${actionKey}`,
    actionKey,
    status: "hecha",
    snoozeUntil: null,
    impact: null,
    createdAt: HOY,
    updatedAt: HOY,
    ...over,
  });

  it("'hecha' y 'descartada' desaparecen; 'pospuesta' vigente va a later con su fecha", () => {
    const plan = buildActionPlan(
      input({
        states: [
          estado("surplus:deuda:2026-09", { status: "hecha", updatedAt: "2026-09-02" }),
          estado("insight:orden:cat-1", { status: "descartada" }),
          estado("insight:crecer:concentracion_inversion", {
            status: "pospuesta",
            snoozeUntil: "2026-10-01",
          }),
        ],
      }),
      "deudas",
    );
    const todas = [plan.hero, ...plan.now, ...plan.later].filter(Boolean);
    const claves = todas.map((a) => a!.key);
    expect(claves).not.toContain("surplus:deuda:2026-09");
    expect(claves).not.toContain("insight:orden:cat-1");

    const pospuesta = plan.later.find((a) => a.key === "insight:crecer:concentracion_inversion");
    expect(pospuesta).toBeDefined();
    expect(pospuesta?.lockReason).toContain("Pospuesta hasta");
    expect(pospuesta?.lockReason).toContain("octubre");
  });

  it("una 'hecha' de un mes anterior vuelve a proponerse", () => {
    const plan = buildActionPlan(
      input({
        states: [estado("surplus:deuda:2026-09", { status: "hecha", updatedAt: "2026-08-20" })],
      }),
      "deudas",
    );
    expect(plan.hero?.key).toBe("surplus:deuda:2026-09");
  });
});

describe("buildActionPlan · forma del plan", () => {
  it("nunca hay más de 3 acciones en `now`", () => {
    const muchos: Insight[] = Array.from({ length: 8 }, (_, i) => ({
      id: `x-${i}`,
      kind: "sobre_sobregirado",
      severity: "accionar",
      title: `Sobre ${i}`,
      body: "…",
      metric: 10_000 + i,
      relatedKind: "category",
      relatedId: `cat-${i}`,
      status: "activo",
      createdAt: HOY,
      updatedAt: HOY,
    }));
    const plan = buildActionPlan(input({ insights: muchos }), "orden");
    expect(plan.now.length).toBeLessThanOrEqual(3);
    expect(plan.later.length).toBeGreaterThan(0);
  });

  it("toda acción lleva un impacto con etiqueta no vacía", () => {
    for (const prioridad of ["deudas", "orden", "proteger", "crecer"] as const) {
      const plan = buildActionPlan(input(), prioridad);
      for (const a of [plan.hero, ...plan.now, ...plan.later]) {
        if (!a) continue;
        expect(a.impact.label.trim().length).toBeGreaterThan(0);
        expect(a.teach.trim().length).toBeGreaterThan(0);
        expect(a.why.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("una acción sin impacto medible no se genera (insight sin metric)", () => {
    const sinMetric: Insight[] = [
      {
        id: "i-sin",
        kind: "sobre_sobregirado",
        severity: "accionar",
        title: "Sin dato",
        body: "…",
        relatedKind: "category",
        relatedId: "cat-9",
        status: "activo",
        createdAt: HOY,
        updatedAt: HOY,
      },
    ];
    const plan = buildActionPlan(input({ insights: sinMetric }), "orden");
    const claves = [plan.hero, ...plan.now, ...plan.later].filter(Boolean).map((a) => a!.key);
    expect(claves).not.toContain("insight:orden:cat-9");
  });
});

describe("buildActionPlan · etapa del camino", () => {
  it("cae en la PRIMERA etapa que falla, con el dato en el blocker", () => {
    // 1 · Estabilidad: flujo negativo.
    expect(buildActionPlan(input({ freeCashflow: -50_000 }), "orden").stage.level).toBe(1);

    // 2 · Protección: fondos sin cubrir gana sobre la deuda cara (que también falla).
    const proteccion = buildActionPlan(
      input({
        freeCashflow: 100_000,
        surplus: surplus({ fundsCovered: false, pay: null }),
        funds: funds({
          activeFund: "emergency",
          emergency: {
            target: 500_000,
            current: 0,
            gap: 500_000,
            progressPct: 0,
            covered: false,
            recommendedMonthly: 41_667,
          },
        }),
      }),
      "orden",
    ).stage;
    expect(proteccion.level).toBe(2);
    expect(proteccion.blockers[0]).toContain("fondo de emergencia");

    // 3 · Deuda cara.
    const sinDeudaCara = buildActionPlan(input(), "orden").stage;
    expect(sinDeudaCara.level).toBe(3);
    expect(sinDeudaCara.blockers[0]).toContain("Tarjeta BAC");
    expect(sinDeudaCara.blockers[0]).toContain("24%");

    // 4 · Sin aporte recurrente.
    expect(
      buildActionPlan(input({ expensiveDebts: [], recurringHoldings: 0 }), "orden").stage.level,
    ).toBe(4);

    // 5 · Concentración (el insight sigue activo en el escenario base).
    const estructura = buildActionPlan(input({ expensiveDebts: [] }), "orden").stage;
    expect(estructura.level).toBe(5);
    expect(estructura.blockers[0]).toContain("72%");

    // Todo en orden: etapa 5 sin bloqueos.
    expect(
      buildActionPlan(input({ expensiveDebts: [], insights: [] }), "orden").stage.blockers,
    ).toEqual([]);
  });
});

describe("resolveActionPriority", () => {
  it("la declarada gana sobre el ranking del onboarding", () => {
    expect(resolveActionPriority("crecer", ["salir de deudas"])).toBe("crecer");
  });

  it("sin declarada, deriva del ranking con sinónimos", () => {
    expect(resolveActionPriority(null, ["Salir de mis deudas"])).toBe("deudas");
    expect(resolveActionPriority(null, ["Tener orden en mi presupuesto"])).toBe("orden");
    expect(resolveActionPriority(null, ["Proteger a mi familia"])).toBe("proteger");
    expect(resolveActionPriority(null, ["Invertir para mi libertad"])).toBe("crecer");
  });

  it("sin nada reconocible, 'orden'", () => {
    expect(resolveActionPriority(null, [])).toBe("orden");
    expect(resolveActionPriority(null, ["algo que no mapea"])).toBe("orden");
  });
});
