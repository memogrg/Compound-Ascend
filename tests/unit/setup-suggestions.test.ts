/**
 * Las sugerencias de los asistentes salen de los números REALES del usuario.
 *
 * El contrato que se protege acá: sin el dato base no hay monto sugerido. Es
 * preferible decir "cargá tus ingresos" que ofrecer una cifra redonda que no
 * significa nada — una sugerencia inventada enseña a desconfiar de todas.
 */
import { describe, it, expect } from "vitest";

import {
  budgetBalance,
  nextAfterBudget,
  suggestDca,
  suggestGoalMonthly,
  suggestJarBudget,
  suggestLifestyle,
  suggestSobreBudget,
  JAR_BENCHMARK,
} from "@/modules/setup/engine/suggestions";
import type { SetupSnapshot, SetupSobre } from "@/modules/setup/types";

const VACIO: SetupSnapshot = {
  currency: "CRC",
  period: { year: 2026, month: 8 },
  incomes: [],
  incomeMonthly: 0,
  jars: [],
  sobres: [],
  budgetedMonthly: 0,
  debts: [],
  goals: [],
  emergency: null,
  peace: null,
  essentialMonthly: 0,
  policies: [],
  holdings: [],
  desiredLifestyle: null,
};

const sobre: SetupSobre = {
  id: "c1",
  name: "Alquiler",
  jarId: "j1",
  jarName: "Vivienda",
  jarKey: "g_vivienda",
  isSystem: true,
  isFavorite: true,
  isEssential: true,
  icon: null,
  color: null,
  budget: null,
  budgetCurrency: null,
  locked: false,
};

describe("sugerencias de reparto", () => {
  it("aplica el benchmark del frasco al ingreso REAL del usuario", () => {
    const s = suggestJarBudget(1_000_000, "g_vivienda", "Vivienda", "CRC");
    expect(s.amount).toBe(1_000_000 * JAR_BENCHMARK.g_vivienda!);
    expect(s.text).toContain("Vivienda");
  });

  it("sin ingreso NO inventa un monto: dice qué falta", () => {
    const s = suggestJarBudget(0, "g_vivienda", "Vivienda", "CRC");
    expect(s.amount).toBeNull();
    expect(s.text).toContain("Cargá tus ingresos");
  });

  it("un frasco sin benchmark (los vinculados) no sugiere nada", () => {
    // Deudas/Defensa/Ahorro se configuran en su propio asistente, con su motor.
    expect(suggestJarBudget(1_000_000, "g_deudas", "Deudas", "CRC").amount).toBeNull();
    expect(suggestJarBudget(1_000_000, null, "Sin frasco", "CRC").text).toBe("");
  });

  it("reparte la porción del frasco entre los sobres que lo comparten", () => {
    const solo = suggestSobreBudget(1_000_000, sobre, 1, "CRC");
    const dos = suggestSobreBudget(1_000_000, sobre, 2, "CRC");
    expect(solo.amount).toBe(300_000);
    expect(dos.amount).toBe(150_000);
    expect(dos.text).toContain("2 sobres");
  });
});

describe("balance del presupuesto", () => {
  it("marca excedido cuando se reparte más de lo que entra", () => {
    const b = budgetBalance(500_000, 700_000, "CRC");
    expect(b.tone).toBe("excedido");
    expect(b.free).toBe(-200_000);
  });

  it("marca ajustado cuando queda menos del 5% libre", () => {
    expect(budgetBalance(1_000_000, 970_000, "CRC").tone).toBe("ajustado");
  });

  it("sin ingreso no pretende calcular un reparto", () => {
    expect(budgetBalance(0, 0, "CRC").tone).toBe("sin_datos");
  });
});

describe("encadenado con sentido", () => {
  it("sin sobrante no ofrece nada (no hay con qué)", () => {
    expect(nextAfterBudget(VACIO, 0)).toBeNull();
  });

  it("con sobrante y sin fondo de emergencia, manda a Defensa primero", () => {
    const n = nextAfterBudget(VACIO, 200_000);
    expect(n?.wizard).toBe("defensa");
    expect(n?.text).toContain("fondo de emergencia");
  });

  it("con la emergencia cubierta y deuda cara, manda a Control con SU tasa", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      emergency: {
        target: 500_000,
        current: 500_000,
        gap: 0,
        progressPct: 1,
        covered: true,
        recommendedMonthly: 0,
        registered: true,
      },
      debts: [
        { id: "d1", name: "Tarjeta BAC", balance: 800_000, minPayment: 40_000, apr: 45, currency: "CRC" },
      ],
    };
    const n = nextAfterBudget(s, 200_000);
    expect(n?.wizard).toBe("control");
    expect(n?.text).toContain("Tarjeta BAC");
    expect(n?.text).toContain("45%");
  });

  it("con la base cubierta y sin deuda cara, manda a Crecimiento", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      emergency: {
        target: 500_000,
        current: 500_000,
        gap: 0,
        progressPct: 1,
        covered: true,
        recommendedMonthly: 0,
        registered: true,
      },
    };
    expect(nextAfterBudget(s, 200_000)?.wizard).toBe("crecimiento");
  });
});

describe("aportes sugeridos", () => {
  it("una meta con fecha reparte la brecha en los meses que faltan", () => {
    const s = suggestGoalMonthly(1_200_000, 0, "2027-08-01", new Date("2026-08-25"), "CRC");
    expect(s.amount).toBe(100_000);
    expect(s.text).toContain("12 meses");
  });

  it("una meta sin fecha usa el horizonte de 12 meses y lo dice", () => {
    const s = suggestGoalMonthly(600_000, 0, null, new Date("2026-08-25"), "CRC");
    expect(s.amount).toBe(50_000);
    expect(s.text).toContain("12 meses");
  });

  it("una meta ya alcanzada no sugiere aporte", () => {
    expect(suggestGoalMonthly(500_000, 500_000, null, new Date(), "CRC").amount).toBeNull();
  });

  it("el DCA no se sugiere mientras el fondo de emergencia no esté cubierto", () => {
    const s = suggestDca(VACIO, 300_000, "CRC");
    expect(s.amount).toBeNull();
    expect(s.text).toContain("fondo de emergencia");
  });

  it("con la base cubierta sugiere la mitad del excedente y explica por qué", () => {
    const snap: SetupSnapshot = {
      ...VACIO,
      emergency: {
        target: 1,
        current: 1,
        gap: 0,
        progressPct: 1,
        covered: true,
        recommendedMonthly: 0,
        registered: true,
      },
    };
    const s = suggestDca(snap, 300_000, "CRC");
    expect(s.amount).toBe(150_000);
    expect(s.text).toContain("colchón");
  });

  it("el estilo de vida deseado se ancla en el gasto real, con 20% de margen", () => {
    expect(suggestLifestyle(800_000, 500_000, "CRC").amount).toBe(960_000);
  });

  it("sin gasto configurado, el estilo de vida no se inventa", () => {
    expect(suggestLifestyle(0, 0, "CRC").amount).toBeNull();
  });
});
