import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/**
 * Agregados de gasto por RANGO para el tab de Gastos (segmented 1m/3m/6m/YTD/All).
 * Scopea SOLO las 4 cards y las 2 gráficas; no toca los frascos (que tienen su
 * propio filtro de fecha). Decisión de datos:
 *   · chart "Histórico de gastos" → buckets mensuales de getRealHistory.
 *   · cards "Gasto real"/donut "Composición" → getRealTotals sobre el span
 *     completo (un solo query; realExpense exacto + expenseByKey por categoría,
 *     que la serie histórica no trae).
 *   · cards "Gasto planificado" → suma del presupuesto por bucket (misma fuente
 *     que getBudgetTotals: budget_items del mes convertidos a la moneda).
 * Todo en la moneda de visualización (lo garantizan getRealTotals/getRealHistory).
 * `1m` deja el span en el mes actual → idéntico al comportamiento de arranque.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  getRealTotals,
  getRealHistory,
  type HistoryPoint,
  type KeyedTotals,
} from "@/modules/financial-base/services/transaction-service";
import { getEntityFallbackBudget } from "@/modules/financial-base/services/expense-jars-service";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import { previousMonthPeriod } from "@/modules/financial-base/engine/period";
import type { Period } from "@/modules/financial-base/types";

export const EXPENSE_RANGES = ["1m", "3m", "6m", "ytd", "all"] as const;
export type ExpenseRange = (typeof EXPENSE_RANGES)[number];

export type ExpenseRangeView = {
  range: ExpenseRange;
  budgetExpense: number;
  realExpense: number;
  expenseByKey: KeyedTotals;
  history: HistoryPoint[];
};

/** Normaliza el ?range crudo; cae a "1m" si no es válido. */
export function parseExpenseRange(raw: string | undefined | null): ExpenseRange {
  return (EXPENSE_RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as ExpenseRange)
    : "1m";
}

/** Cuántos meses cubre el rango, contando hacia atrás desde `period` (incluido). */
async function monthsBackFor(range: ExpenseRange, period: Period): Promise<number> {
  switch (range) {
    case "1m":
      return 1;
    case "3m":
      return 3;
    case "6m":
      return 6;
    case "ytd":
      return period.month; // enero..mes actual del año en curso
    case "all": {
      const user = await requireUser();
      const supabase = await createSupabaseServerClient();
      const memberIds = await householdMemberIds(supabase, user.id);
      const { data } = await supabase
        .from("transactions")
        .select("occurred_on")
        .in("user_id", memberIds)
        .order("occurred_on", { ascending: true })
        .limit(1);
      const first = data?.[0]?.occurred_on;
      if (!first) return 1;
      const d = new Date(first);
      const months = (period.year - d.getFullYear()) * 12 + (period.month - (d.getMonth() + 1)) + 1;
      return Math.max(1, months);
    }
  }
}

export async function getExpenseRangeView(
  rangeRaw: string | undefined,
  period: Period,
): Promise<ExpenseRangeView> {
  const range = parseExpenseRange(rangeRaw);
  const monthsBack = await monthsBackFor(range, period);

  // Inicio del span: `monthsBack-1` meses atrás; el fin queda en `period.to`.
  let spanStart = period;
  for (let i = 0; i < monthsBack - 1; i++) spanStart = previousMonthPeriod(spanStart);
  const spanPeriod: Period = { ...period, from: spanStart.from };

  const [spanTotals, history, fallback] = await Promise.all([
    getRealTotals(spanPeriod),
    getRealHistory(period, monthsBack),
    // Presupuesto que no vive en budget_items (aporte de holdings/rentas). Sin esto el
    // titular no cuadraba con los frascos de su propia pantalla: mismo dinero contado
    // como gastado pero no como presupuestado.
    getEntityFallbackBudget(period, await getDisplayCurrency()),
  ]);

  // Se suma UNA vez, al mes de `period`, no a cada bucket del rango. Del aporte solo
  // conocemos su valor actual; multiplicarlo por los meses del rango inventaría un
  // historial que no está en ninguna parte, y sobreestimaría a quien empezó a aportar
  // hace poco. Para "1m" —la tarjeta y el arranque de Gastos— es exacto, que es donde
  // estaba la contradicción. Los rangos largos quedan como estaban para los meses
  // pasados; eso lo cierra de verdad el día que los holdings emitan su línea derivada.
  const budgetExpense = history.reduce((s, h) => s + h.budgetExpense, 0) + fallback;

  return {
    range,
    budgetExpense,
    realExpense: spanTotals.realExpense,
    expenseByKey: spanTotals.expenseByKey,
    history,
  };
}
