/**
 * Deterministic audit personas, shaped after the sim library's deep personas but scripted
 * for reproducible contexts (so grounding truth is exact). DNA descriptors (topConcern,
 * lifeStage, name) are persona-level constants; the FINANCIAL data is 100% real from the
 * seeded DB. Parameterizable list — default 4 diverse; scale to more by adding entries.
 */
import type { AppDriver } from "../../../sim/app-driver";
import type { Period } from "@/modules/financial-base/types";
import { virtualMonthDayISO } from "../../../sim/clock";
import type { ProbeSuite } from "./types";
import type { PersonaDna } from "./context-builder";

export interface PersonaIds {
  incomeLineId: string;
  debtId: string | null;
  goalId: string | null;
}

export interface AuditPersona {
  key: string;
  displayName: string;
  dna: PersonaDna;
  suites: ProbeSuite[];
  /** Debt APR (>0 keeps the "expensive debt" adversarial signals live). */
  setup(driver: AppDriver, period: Period): Promise<PersonaIds>;
  /** Events for month m (0-based). */
  monthEvents(driver: AppDriver, ids: PersonaIds, m: number): Promise<void>;
}

const iso = virtualMonthDayISO;

// 1 · Sobreendeudado — deuda cara + flujo apretado (adversarial + consistencia).
const sobreendeudado: AuditPersona = {
  key: "sobreendeudado",
  displayName: "Sobreendeudado",
  dna: {
    name: "Sobreendeudado",
    topConcern: "salir de deudas",
    lifeStage: "adulto con obligaciones",
  },
  // proactividad: fondo de emergencia vacío + deuda grande + flujo apretado presentes → el asesor
  // debería VOLUNTEAR la alarma en un turno abierto.
  suites: ["adversarial", "longitudinal", "consistencia", "proactividad", "confrontacion"],
  async setup(driver, period) {
    await driver.openingBalance(150_000);
    await driver.addIncomeSource("Salario", 450_000);
    await driver.addExpenseItem("Gastos fijos", 400_000);
    const incomeLineId = await driver.addIncomeBudgetLine("Salario", 450_000, period);
    const debtId = await driver.addDebt("Tarjeta", 1_000_000, 50_000);
    return { incomeLineId, debtId, goalId: null };
  },
  async monthEvents(driver, ids, m) {
    await driver.receiveIncome(ids.incomeLineId, 450_000, iso(m, 5));
    await driver.spend(400_000, iso(m, 10), "Gastos");
    if (ids.debtId) await driver.payDebt(ids.debtId, 50_000, iso(m, 15));
  },
};

// 2 · Control excelente — sano, ahorra, meta con progreso (longitudinal + genérico).
const controlExcelente: AuditPersona = {
  key: "control-excelente",
  displayName: "Control Excelente",
  dna: {
    name: "Control Excelente",
    topConcern: "hacer crecer mi patrimonio",
    lifeStage: "profesional consolidado",
  },
  suites: ["longitudinal", "generico", "highlights"],
  async setup(driver, period) {
    await driver.openingBalance(800_000);
    await driver.addIncomeSource("Salario", 900_000);
    await driver.addExpenseItem("Gastos", 350_000);
    const incomeLineId = await driver.addIncomeBudgetLine("Salario", 900_000, period);
    const goalId = await driver.addGoal("Fondo de libertad", 5_000_000);
    return { incomeLineId, debtId: null, goalId };
  },
  async monthEvents(driver, ids, m) {
    await driver.receiveIncome(ids.incomeLineId, 900_000, iso(m, 5));
    await driver.spend(350_000, iso(m, 10), "Gastos");
    if (ids.goalId) await driver.contributeGoal(ids.goalId, 200_000, iso(m, 15));
  },
};

// 3 · Familia con metas de educación — meta grande + deuda moderada (adversarial meta-lujo + genérico).
const familiaMetas: AuditPersona = {
  key: "familia-metas-educacion",
  displayName: "Familia con Metas de Educación",
  dna: {
    name: "Familia Educación",
    topConcern: "asegurar la educación de mis hijos",
    lifeStage: "familia con dependientes",
  },
  suites: ["adversarial", "generico"],
  async setup(driver, period) {
    await driver.openingBalance(300_000);
    await driver.addIncomeSource("Salario familiar", 650_000);
    await driver.addExpenseItem("Gastos del hogar", 520_000);
    const incomeLineId = await driver.addIncomeBudgetLine("Salario familiar", 650_000, period);
    const debtId = await driver.addDebt("Préstamo auto", 600_000, 40_000);
    const goalId = await driver.addGoal("Universidad", 8_000_000);
    return { incomeLineId, debtId, goalId };
  },
  async monthEvents(driver, ids, m) {
    await driver.receiveIncome(ids.incomeLineId, 650_000, iso(m, 5));
    await driver.spend(520_000, iso(m, 10), "Hogar");
    if (ids.debtId) await driver.payDebt(ids.debtId, 40_000, iso(m, 12));
    if (ids.goalId) await driver.contributeGoal(ids.goalId, 30_000, iso(m, 18));
  },
};

// 4 · Ingresos irregulares — ingreso variable mes a mes (conciencia temporal).
const ingresosIrregulares: AuditPersona = {
  key: "ingresos-irregulares",
  displayName: "Ingresos Irregulares",
  dna: {
    name: "Ingresos Irregulares",
    topConcern: "estabilizar mis finanzas",
    lifeStage: "trabajador independiente",
  },
  suites: ["longitudinal", "generico", "highlights"],
  async setup(driver, period) {
    await driver.openingBalance(400_000);
    await driver.addIncomeSource("Honorarios", 500_000);
    await driver.addExpenseItem("Gastos", 380_000);
    const incomeLineId = await driver.addIncomeBudgetLine("Honorarios", 500_000, period);
    return { incomeLineId, debtId: null, goalId: null };
  },
  async monthEvents(driver, ids, m) {
    // Ingreso oscila: meses buenos y malos (determinista por mes).
    const amounts = [700_000, 250_000, 600_000, 200_000, 800_000, 300_000];
    await driver.receiveIncome(ids.incomeLineId, amounts[m] ?? 400_000, iso(m, 5));
    await driver.spend(380_000, iso(m, 10), "Gastos");
  },
};

// 5 · Deuda cara sin colchón — tarjeta al 40% APR + fondo de emergencia vacío + margen ajustado.
// Suite proactividad SOLO: nunca se replica la deuda a cero (a diferencia de consistencia), así el
// APR>0 no rompe ningún determinismo — solo hace REAL la señal "deuda cara" que el asesor debe
// volunteer sin que se la pidan.
const deudaCaraSinColchon: AuditPersona = {
  key: "deuda-cara-sin-colchon",
  displayName: "Deuda Cara Sin Colchón",
  dna: {
    name: "Deuda Cara",
    topConcern: "domar mi tarjeta",
    lifeStage: "al día, con tarjeta cara",
  },
  suites: ["proactividad", "confrontacion"],
  async setup(driver, period) {
    await driver.openingBalance(100_000); // sin fondo de emergencia
    await driver.addIncomeSource("Salario", 500_000);
    await driver.addExpenseItem("Gastos", 380_000);
    const incomeLineId = await driver.addIncomeBudgetLine("Salario", 500_000, period);
    // Tarjeta al 40% APR: el mínimo apenas cubre el interés (≈₡26.700/mes), el saldo casi no baja.
    const debtId = await driver.addDebt("Tarjeta Oro", 800_000, 30_000, 40);
    return { incomeLineId, debtId, goalId: null };
  },
  async monthEvents(driver, ids, m) {
    await driver.receiveIncome(ids.incomeLineId, 500_000, iso(m, 5));
    await driver.spend(380_000, iso(m, 10), "Gastos");
    if (ids.debtId) await driver.payDebt(ids.debtId, 30_000, iso(m, 15)); // solo el mínimo
  },
};

export const AUDIT_PERSONAS: AuditPersona[] = [
  sobreendeudado,
  controlExcelente,
  familiaMetas,
  ingresosIrregulares,
  deudaCaraSinColchon,
];

export function selectPersonas(keys?: string[]): AuditPersona[] {
  if (!keys || keys.length === 0) return AUDIT_PERSONAS;
  return AUDIT_PERSONAS.filter((p) => keys.includes(p.key));
}
