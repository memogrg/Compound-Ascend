import "server-only";

/**
 * Datos reales para dimensionar los fondos de defensa (F1). Junta: moneda principal + tasas,
 * gasto esencial mensual SIN los aportes a los propios fondos (anti-circularidad), el acumulado
 * de cada fondo (metas savings_goals defensa:fondo_*), y la preferencia peaceMonths del usuario;
 * delega el cálculo al engine puro computeDefenseFunds. Sin UI (eso es F2).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds } from "@/lib/household/active";
import { getPrimaryCurrency } from "@/modules/financial-base";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { getEssentialMonthlyExpense } from "@/modules/wealth/services/essential-expense-service";
import {
  computeDefenseFunds,
  emergencyTargetIn,
  DEFENSE_FUND_GOAL_TYPES,
  PEACE_MONTHS_DEFAULT,
  PEACE_MONTHS_MIN,
  PEACE_MONTHS_MAX,
  type DefenseFundsPlan,
} from "@/modules/wealth/engine/fund-sizing";

export type DefenseFundsReport = DefenseFundsPlan & { currency: string };

/** Meses del fondo de paz del usuario (preferencia PERSONAL). Default 3 si no hay valor. */
export async function getPeaceMonths(): Promise<number> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_settings")
    .select("peace_fund_months")
    .eq("user_id", user.id)
    .maybeSingle();
  const n = data?.peace_fund_months;
  return typeof n === "number" ? n : PEACE_MONTHS_DEFAULT;
}

/** Fija los meses del fondo de paz (acotado 3-6). Preferencia personal. Devuelve el valor guardado. */
export async function setPeaceMonths(months: number): Promise<number> {
  const clamped = Math.min(PEACE_MONTHS_MAX, Math.max(PEACE_MONTHS_MIN, Math.round(months)));
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, peace_fund_months: clamped }, { onConflict: "user_id" });
  return clamped;
}

/** Plan dimensionado de los fondos de emergencia y paz, en la moneda PRINCIPAL del usuario. */
export async function getDefenseFundsReport(): Promise<DefenseFundsReport> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [members, currency, rates, peaceMonths] = await Promise.all([
    householdMemberIds(supabase, user.id),
    getPrimaryCurrency(),
    getFxRates(),
    getPeaceMonths(),
  ]);

  // Esencial SIN los aportes a los propios fondos de defensa, en la moneda principal.
  const essential = await getEssentialMonthlyExpense({ currency, excludeDefenseFunds: true }).catch(
    () => null,
  );
  const essentialMonthly = essential?.total ?? 0;

  // Acumulado por fondo (metas savings_goals defensa:fondo_*), convertido a la moneda principal.
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("current_amount,currency,goal_type")
    .in("user_id", members)
    .in("goal_type", [...DEFENSE_FUND_GOAL_TYPES]);
  const sumBy = (type: string) =>
    (goals ?? [])
      .filter((g) => g.goal_type === type)
      .reduce(
        (s, g) => s + convertCurrency(Number(g.current_amount ?? 0), g.currency, currency, rates),
        0,
      );

  const plan = computeDefenseFunds({
    emergencyTarget: emergencyTargetIn(currency, rates),
    emergencyCurrent: sumBy("defensa:fondo_emergencia"),
    peaceMonths,
    essentialMonthly,
    peaceCurrent: sumBy("defensa:fondo_paz"),
  });
  return { ...plan, currency };
}
