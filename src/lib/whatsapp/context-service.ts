import "server-only";

/**
 * Construye el FinancialContext AUTORIZADO del usuario/hogar para el bot, con
 * service-role (solo lectura) ya que el webhook no tiene sesión. Limita los
 * datos al hogar del usuario; nunca de otros.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getUserCurrency, getUserDisplayName } from "@/lib/whatsapp/links-service";
import type { FinancialContext } from "@/lib/ai/orchestrator";

function sumMonthly(rows: { amount_monthly_base: number | null }[] | null): number {
  return (rows ?? []).reduce((acc, r) => acc + Number(r.amount_monthly_base ?? 0), 0);
}

export async function buildContextForUser(
  userId: string,
  householdId: string | null,
): Promise<FinancialContext> {
  const supabase = createServiceRoleClient();
  const [name, currency] = await Promise.all([getUserDisplayName(userId), getUserCurrency(userId)]);

  // Incluye filas propias y, si pertenece a un hogar, las del hogar.
  const orFilter = householdId
    ? `user_id.eq.${userId},household_id.eq.${householdId}`
    : `user_id.eq.${userId}`;
  const [{ data: inc }, { data: exp }] = await Promise.all([
    supabase.from("income_sources").select("amount_monthly_base").or(orFilter),
    supabase.from("expense_items").select("amount_monthly_base").or(orFilter),
  ]);
  const incomeMonthly = sumMonthly(inc);
  const expenseMonthly = sumMonthly(exp);

  return {
    name: name || undefined,
    currency,
    incomeMonthly,
    expenseMonthly,
    freeCashflow: incomeMonthly - expenseMonthly,
  };
}
