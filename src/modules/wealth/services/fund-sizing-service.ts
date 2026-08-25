import "server-only";

/**
 * Datos reales para dimensionar los fondos de defensa (F1). Junta: moneda principal + tasas,
 * gasto esencial mensual SIN los aportes a los propios fondos (anti-circularidad), el acumulado
 * de cada fondo (metas savings_goals defensa:fondo_*), y la preferencia peaceMonths del usuario;
 * delega el cálculo al engine puro computeDefenseFunds. Sin UI (eso es F2).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
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

export type DefenseFundsReport = DefenseFundsPlan & {
  currency: string;
  /** ¿Existe una meta de defensa registrada por fondo? (registrado ≠ acumulado>0: puede estar en 0). */
  emergencyRegistered: boolean;
  peaceRegistered: boolean;
  /**
   * Goal genérico llamado "emergencia" (con saldo, NO formal) que se puede convertir en el
   * fondo formal con 1 tap. `null` si ya hay fondo formal o no hay candidato. Nunca se
   * auto-migra: es el usuario quien confirma con el tap.
   */
  emergencyCandidate: { id: string; name: string } | null;
};

/** Meses del fondo de paz del usuario (preferencia PERSONAL). Default 3 si no hay valor. */
export async function getPeaceMonths(ctx?: AuthContext): Promise<number> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const { data } = await supabase
    .from("user_settings")
    .select("peace_fund_months")
    .eq("user_id", userId)
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
export async function getDefenseFundsReport(ctx?: AuthContext): Promise<DefenseFundsReport> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const [members, currency, rates, peaceMonths] = await Promise.all([
    householdMemberIds(supabase, userId),
    getPrimaryCurrency(ctx),
    getFxRates(),
    getPeaceMonths(ctx),
  ]);

  // Esencial SIN los aportes a los propios fondos de defensa, en la moneda principal.
  const essential = await getEssentialMonthlyExpense({
    currency,
    excludeDefenseFunds: true,
    ctx,
  }).catch(() => null);
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

  // Registrado = existe la meta (aunque su acumulado sea 0). Distingue "no lo tenés" de "en 0".
  const hasType = (type: string) => (goals ?? []).some((g) => g.goal_type === type);
  const emergencyRegistered = hasType("defensa:fondo_emergencia");

  // Nudge (delta 2): un goal genérico llamado "emergencia" que NO es el fondo formal. Solo si
  // aún no hay fondo formal, para ofrecer convertirlo con 1 tap (nunca auto-migramos el tipo).
  let emergencyCandidate: { id: string; name: string } | null = null;
  if (!emergencyRegistered) {
    const { data: named } = await supabase
      .from("savings_goals")
      .select("id,name,goal_type,current_amount")
      .in("user_id", members)
      .ilike("name", "%emergencia%");
    const cand = (named ?? []).find(
      (g) => g.goal_type !== "defensa:fondo_emergencia" && Number(g.current_amount) > 0,
    );
    emergencyCandidate = cand ? { id: cand.id, name: cand.name ?? "" } : null;
  }

  const plan = computeDefenseFunds({
    emergencyTarget: emergencyTargetIn(currency, rates),
    emergencyCurrent: sumBy("defensa:fondo_emergencia"),
    peaceMonths,
    essentialMonthly,
    peaceCurrent: sumBy("defensa:fondo_paz"),
  });
  return {
    ...plan,
    currency,
    emergencyRegistered,
    peaceRegistered: hasType("defensa:fondo_paz"),
    emergencyCandidate,
  };
}
