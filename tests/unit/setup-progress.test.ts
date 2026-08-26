/**
 * El progreso de los asistentes es DERIVADO del estado real.
 *
 * Estos tests son la guardia del principio rector del módulo: no existe ninguna
 * bandera de progreso. Un sobre creado en la app aparece en el asistente porque
 * el asistente lee la misma entidad; borrar un ingreso hace retroceder el paso.
 * Si alguien introdujera un flag persistido, estos tests seguirían pasando —
 * pero el de `setup-usa-actions-existentes` fallaría al detectar la escritura
 * propia, y este archivo documenta por qué no hace falta ese flag.
 */
import { describe, it, expect } from "vitest";

import {
  controlSteps,
  crecimientoSteps,
  defensaSteps,
  deriveSetupProgress,
  deriveWizardProgress,
  isSetupWizardId,
  presupuestoSteps,
  setupOverall,
} from "@/modules/setup/engine/progress";
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

function sobre(over: Partial<SetupSobre> = {}): SetupSobre {
  return {
    id: over.id ?? "cat-1",
    name: "Supermercado",
    jarId: "jar-1",
    jarName: "Alimentación",
    jarKey: "g_alimentacion",
    isSystem: false,
    isFavorite: true,
    isEssential: true,
    icon: null,
    color: null,
    budget: null,
    budgetCurrency: null,
    locked: false,
    ...over,
  };
}

const ingreso = {
  id: "inc-1",
  name: "Salario",
  amount: 1_000_000,
  amountMonthly: 1_000_000,
  currency: "CRC",
  incomeType: "activo",
  frequency: "mensual",
  recurrent: true,
};

describe("progreso derivado · Presupuesto", () => {
  it("sin datos, los cuatro pasos están abiertos y el asistente no empezó", () => {
    const p = deriveWizardProgress("presupuesto", VACIO);
    expect(p.done).toBe(0);
    expect(p.total).toBe(4);
    expect(p.status).toBe("sin_empezar");
    expect(p.resumeIndex).toBe(0);
  });

  it("un sobre creado EN LA APP ya cuenta en el asistente (sin sincronizar nada)", () => {
    // Lo único que cambia es la entidad real: una categoría hoja marcada favorita.
    const conSobre: SetupSnapshot = { ...VACIO, sobres: [sobre()] };
    const [ingresos, sobres] = presupuestoSteps(conSobre);
    expect(sobres!.done).toBe(true);
    expect(sobres!.detail).toContain("1 sobre activo");
    // Y no contamina los demás pasos: el ingreso sigue faltando.
    expect(ingresos!.done).toBe(false);
  });

  it("una hoja NO favorita no es un sobre todavía", () => {
    const s: SetupSnapshot = { ...VACIO, sobres: [sobre({ isFavorite: false })] };
    expect(presupuestoSteps(s)[1]!.done).toBe(false);
  });

  it("quitar el ingreso hace RETROCEDER el paso (progreso derivado, no acumulado)", () => {
    const con: SetupSnapshot = { ...VACIO, incomes: [ingreso], incomeMonthly: 1_000_000 };
    expect(presupuestoSteps(con)[0]!.done).toBe(true);
    const sin: SetupSnapshot = { ...con, incomes: [], incomeMonthly: 0 };
    expect(presupuestoSteps(sin)[0]!.done).toBe(false);
    expect(deriveWizardProgress("presupuesto", sin).status).toBe("sin_empezar");
  });

  it("con ingresos, sobres y montos queda listo y el resumen muestra el libre", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      incomes: [ingreso],
      incomeMonthly: 1_000_000,
      sobres: [sobre({ budget: 300_000, budgetCurrency: "CRC" })],
      budgetedMonthly: 300_000,
    };
    const p = deriveWizardProgress("presupuesto", s);
    expect(p.status).toBe("listo");
    expect(p.done).toBe(4);
    expect(p.steps[3]!.detail).toBe("Libre: ₡700.000");
  });

  it("el detalle de montos dice cuántos sobres tienen monto sobre el total", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      incomes: [ingreso],
      incomeMonthly: 1_000_000,
      sobres: [sobre({ id: "a", budget: 200_000 }), sobre({ id: "b" })],
      budgetedMonthly: 200_000,
    };
    expect(presupuestoSteps(s)[2]!.detail).toContain("1/2");
  });
});

describe("progreso derivado · Control", () => {
  it("las deudas son un paso OPCIONAL: sin deudas y con meta, el asistente queda listo", () => {
    // Quien no debe nada no puede 'completar' el paso de deudas nunca. Marcarlo
    // requerido lo dejaría atrapado en 1/2 para siempre.
    const s: SetupSnapshot = {
      ...VACIO,
      goals: [
        {
          id: "g1",
          name: "Viaje",
          kind: "meta",
          goalType: null,
          targetAmount: 500_000,
          currentAmount: 0,
          monthlyContribution: 50_000,
          recurrence: "ninguna",
          currency: "CRC",
        },
      ],
    };
    const p = deriveWizardProgress("control", s);
    expect(p.steps[0]!.optional).toBe(true);
    expect(p.status).toBe("listo");
    expect(p.done).toBe(1);
  });

  it("los fondos de defensa NO cuentan como metas de Control (no se cuentan dos veces)", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      goals: [
        {
          id: "g1",
          name: "Fondo de emergencia",
          kind: "meta",
          goalType: "defensa:fondo_emergencia",
          targetAmount: 500_000,
          currentAmount: 100_000,
          monthlyContribution: 25_000,
          recurrence: "ninguna",
          currency: "CRC",
        },
      ],
    };
    expect(controlSteps(s)[1]!.done).toBe(false);
  });
});

describe("progreso derivado · Defensa", () => {
  const fondo = {
    target: 500_000,
    current: 100_000,
    gap: 400_000,
    progressPct: 0.2,
    covered: false,
    recommendedMonthly: 33_333,
  };

  it("un fondo dimensionado pero SIN meta registrada no cuenta como configurado", () => {
    const s: SetupSnapshot = { ...VACIO, emergency: { ...fondo, registered: false } };
    expect(defensaSteps(s)[0]!.done).toBe(false);
    expect(defensaSteps(s)[0]!.detail).toContain("faltan");
  });

  it("registrado en 0 SÍ cuenta: 'no lo tenés' y 'está en cero' son distintos", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      emergency: { ...fondo, current: 0, gap: 500_000, progressPct: 0, registered: true },
    };
    expect(defensaSteps(s)[0]!.done).toBe(true);
  });

  it("las pólizas son opcionales: con los dos fondos registrados el asistente queda listo", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      emergency: { ...fondo, registered: true },
      peace: { ...fondo, months: 3, blockedByEmergency: true, registered: true },
    };
    const p = deriveWizardProgress("defensa", s);
    expect(p.status).toBe("listo");
    expect(p.steps[2]!.optional).toBe(true);
  });
});

describe("progreso derivado · Crecimiento", () => {
  it("sin inversiones pero con estilo de vida definido, el asistente queda listo", () => {
    // No invertir todavía es una respuesta legítima; definir el número de
    // Libertad es lo único que este asistente necesita de verdad.
    const s: SetupSnapshot = { ...VACIO, desiredLifestyle: { amount: 900_000, currency: "CRC" } };
    const p = deriveWizardProgress("crecimiento", s);
    expect(p.status).toBe("listo");
    expect(crecimientoSteps(s)[2]!.done).toBe(true);
  });

  it("un aporte DCA en 0 no cuenta como configurado", () => {
    const s: SetupSnapshot = {
      ...VACIO,
      holdings: [
        {
          id: "h1",
          label: "VOO",
          symbol: "VOO",
          assetType: "etf",
          quantity: 3,
          averageCost: 400,
          currency: "USD",
          monthlyContribution: 0,
          isRecurring: false,
        },
      ],
    };
    expect(crecimientoSteps(s)[0]!.done).toBe(true);
    expect(crecimientoSteps(s)[1]!.done).toBe(false);
  });
});

describe("hub", () => {
  it("con todo vacío hay cuatro asistentes sin empezar y ninguno listo", () => {
    const progreso = deriveSetupProgress(VACIO);
    expect(progreso).toHaveLength(4);
    const overall = setupOverall(progreso);
    expect(overall.done).toBe(0);
    expect(overall.allReady).toBe(false);
    expect(overall.next?.id).toBe("presupuesto");
  });

  it("`next` prefiere el que está EN CURSO sobre el que no empezó", () => {
    const s: SetupSnapshot = { ...VACIO, sobres: [sobre()] };
    expect(setupOverall(deriveSetupProgress(s)).next?.id).toBe("presupuesto");
  });

  it("resumeIndex apunta al primer paso sin resolver", () => {
    const s: SetupSnapshot = { ...VACIO, incomes: [ingreso], incomeMonthly: 500_000 };
    expect(deriveWizardProgress("presupuesto", s).resumeIndex).toBe(1);
  });

  it("la guarda de la ruta solo acepta los cuatro ids", () => {
    expect(isSetupWizardId("presupuesto")).toBe(true);
    expect(isSetupWizardId("patrimonio")).toBe(false);
  });
});
