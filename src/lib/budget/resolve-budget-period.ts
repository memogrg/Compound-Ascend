import "server-only";

/**
 * Lectura del mes de presupuesto vigente. La regla y el porqué viven en `budget-period.ts`
 * (puro, importable desde componentes); acá solo va la consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetPeriod } from "@/lib/budget/budget-period";

export async function resolveBudgetPeriod(
  // El cliente llega ya resuelto (sesión o service-role) desde el service que llama.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  memberIds: string[],
  actual: { month: number; year: number },
): Promise<BudgetPeriod> {
  const delMes = await db
    .from("budget_items")
    .select("id")
    .in("user_id", memberIds)
    .eq("type", "expense")
    .eq("period_year", actual.year)
    .eq("period_month", actual.month)
    .limit(1);
  if ((delMes.data ?? []).length > 0) return { ...actual, isFallback: false };

  // Sin líneas este mes → el último mes ANTERIOR que sí tenga. El corte es por (año, mes),
  // no por año: en septiembre de 2026, diciembre de 2026 es futuro y no debe ganar.
  const previos = await db
    .from("budget_items")
    .select("period_month,period_year")
    .in("user_id", memberIds)
    .eq("type", "expense")
    .or(
      `period_year.lt.${actual.year},and(period_year.eq.${actual.year},period_month.lt.${actual.month})`,
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1);

  const fila = (previos.data ?? [])[0];
  // Sin presupuesto en ningún mes anterior: se devuelve el actual (los sobres darán 0, que
  // es la verdad) y NO se marca fallback: no hay nada de qué avisar.
  if (!fila) return { ...actual, isFallback: false };
  return { month: Number(fila.period_month), year: Number(fila.period_year), isFallback: true };
}
