/**
 * Lectura de la Base Financiera (determinista, pura, barata y siempre disponible).
 * Diagnóstico + 3 insights + 3 acciones + próximo paso. Una capa de IA opcional
 * puede reescribir el tono más adelante (sección 7 del prompt); esta base no
 * depende de tokens ni red.
 */
import type { FinancialReading } from "@/components/shared/financial-insight-card";
import type { V2Totals, CompositionSlice } from "@/modules/financial-base/engine/base-v2";
import type { FinancialPressure } from "@/modules/financial-base/types";

export type ReadingInput = {
  totals: V2Totals;
  financialPressure: FinancialPressure;
  expenseComposition: CompositionSlice[]; // ordenada desc
  incomeComposition: CompositionSlice[];
  topExpenseCategory: string | null;
  currencyFormat: (n: number) => string;
  periodLabel: string;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Lectura principal (Mi Base Financiera). */
export function buildBaseReading(input: ReadingInput): FinancialReading {
  const { totals, financialPressure, incomeComposition, currencyFormat } = input;
  const fmt = currencyFormat;
  const free = totals.freeCashflowReal;
  const topIncomeShare = incomeComposition[0]?.pct ?? 0;

  const insights: string[] = [];
  const actions: string[] = [];

  // Flujo libre
  if (free > 0) {
    insights.push(`Tu flujo libre real del mes es ${fmt(free)} (${pct(totals.freeCashflowPct)} de tus ingresos).`);
  } else {
    insights.push(`Tus gastos reales superan tus ingresos: tu flujo libre es ${fmt(free)}. Es la prioridad a corregir.`);
    actions.push("Recorta primero las categorías flexibles que más se salieron del presupuesto.");
  }

  // Gasto vs presupuesto
  if (totals.expenseVariancePct > 0.05) {
    insights.push(`Gastaste ${pct(totals.expenseVariancePct)} por encima de tu presupuesto este mes.`);
    actions.push(
      input.topExpenseCategory
        ? `Revisa la categoría "${input.topExpenseCategory}": es donde más se concentra tu gasto.`
        : "Asigna categorías a tus gastos para ver dónde se va el dinero.",
    );
  } else if (totals.budgetExpense > 0) {
    insights.push(`Mantuviste tus gastos dentro del presupuesto (${pct(totals.expenseVariancePct)} de variación).`);
  }

  // Ingresos vs presupuesto / dependencia
  if (totals.incomeVariancePct < -0.05) {
    insights.push(`Tus ingresos reales quedaron ${pct(Math.abs(totals.incomeVariancePct))} por debajo de lo presupuestado.`);
  }
  if (topIncomeShare > 0.8 && incomeComposition.length > 0) {
    insights.push(`Dependes demasiado de una sola fuente (${pct(topIncomeShare)} de tus ingresos).`);
    actions.push("Explora una fuente de ingreso secundaria antes de subir tus gastos fijos.");
  }

  // Ratio gasto/ingreso
  if (totals.expenseRatio > 0.9 && totals.realIncome > 0) {
    actions.push("Tu ratio gasto/ingreso está alto; apunta a gastar menos del 80% de lo que ingresas.");
  } else if (free > 0 && totals.expenseRatio < 0.7) {
    actions.push("Con tu flujo libre actual, automatiza un ahorro mensual fijo apenas entra tu ingreso.");
  }

  // Próximo paso
  let nextStep: string;
  if (free <= 0) {
    nextStep = "Equilibra tu mes: el objetivo inmediato es que tus ingresos cubran tus gastos y liberar presión.";
  } else if (financialPressure === "alta" || financialPressure === "critica") {
    nextStep = "Antes de crecer, refuerza tu base: prioriza fondo de emergencia y reducir gasto fijo.";
  } else if (totals.expenseRatio < 0.7) {
    nextStep = `Tienes margen sano (${fmt(free)} libres): dirígelo a tus metas de ahorro o inversión.`;
  } else {
    nextStep = "Ajusta una o dos categorías para ampliar tu flujo libre y darte margen de maniobra.";
  }

  // Rellenos por si faltan (siempre 3).
  while (insights.length < 3) insights.push("Tu base luce estable; sigue registrando para afinar las lecturas.");
  while (actions.length < 3) actions.push("Mantén el hábito de registrar cada gasto: lo que se mide, mejora.");

  const diagnosis =
    free > 0
      ? `En ${input.periodLabel} ingresaste ${fmt(totals.realIncome)} y gastaste ${fmt(totals.realExpense)}, con un flujo libre de ${fmt(free)}. Vas en buen camino; aquí está cómo aprovecharlo.`
      : `En ${input.periodLabel} tus gastos (${fmt(totals.realExpense)}) superan tus ingresos (${fmt(totals.realIncome)}). No es para alarmarse: es el punto exacto donde más rápido se mejora.`;

  return {
    title: "Lectura de tu Base Financiera",
    diagnosis,
    insights: insights.slice(0, 3),
    actions: actions.slice(0, 3),
    nextStep,
  };
}

/** Cápsula corta para los tabs de Ingresos / Gastos. */
export function buildCapsule(
  kind: "income" | "expense",
  input: ReadingInput,
): FinancialReading {
  const { totals, currencyFormat: fmt } = input;
  const insights: string[] = [];
  const actions: string[] = [];

  if (kind === "income") {
    const dep = input.incomeComposition[0];
    insights.push(`Ingresos reales: ${fmt(totals.realIncome)} (${pct(totals.incomeVariancePct)} vs presupuesto).`);
    if (dep && dep.pct > 0.7) insights.push(`Tu fuente principal (${dep.label}) pesa ${pct(dep.pct)} del total.`);
    else insights.push("Tienes una mezcla de fuentes razonablemente diversificada.");
    insights.push(`${input.incomeComposition.length} fuente(s) activa(s) este mes.`);
    actions.push(dep && dep.pct > 0.7 ? "Diversifica: una segunda fuente reduce tu riesgo." : "Mantén el ritmo y formaliza tus ingresos variables.");
    actions.push("Registra cada ingreso real para medir tu cumplimiento vs presupuesto.");
  } else {
    insights.push(`Gastos reales: ${fmt(totals.realExpense)} (${pct(totals.expenseVariancePct)} vs presupuesto).`);
    if (input.topExpenseCategory) insights.push(`Tu mayor categoría es "${input.topExpenseCategory}".`);
    insights.push(`Ratio gasto/ingreso: ${pct(totals.expenseRatio)}.`);
    actions.push(totals.expenseVariancePct > 0.05 ? "Recorta donde más te saliste del presupuesto." : "Vas dentro del presupuesto; mantén el control.");
    actions.push("Marca tus gastos recurrentes para anticipar el mes siguiente.");
  }
  while (insights.length < 3) insights.push("Sigue registrando para afinar la lectura.");
  while (actions.length < 2) actions.push("Mantén el hábito de registrar.");

  return {
    title: kind === "income" ? "Lectura de tus ingresos" : "Lectura de tus gastos",
    diagnosis:
      kind === "income"
        ? `Cumpliste el ${pct(1 + totals.incomeVariancePct)} de tu presupuesto de ingresos.`
        : `Ejecutaste el ${pct(1 + totals.expenseVariancePct)} de tu presupuesto de gastos.`,
    insights: insights.slice(0, 3),
    actions: actions.slice(0, 2),
    nextStep: "",
  };
}
