import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/**
 * Ensamblador del Marco Patrimonial: llena PatrimonioInput con datos reales y
 * corre el motor puro. Reutiliza aggregateNetWorth (rich-life) para activos/
 * pasivos/protección/portfolio ya normalizados, y añade las piezas propias del
 * patrimonio (deuda mala, aporte mensual, edad). Respeta RLS y moneda de display.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { monthlyize, type Frequency } from "@/modules/financial-base";
import { aggregateNetWorth } from "@/modules/rich-life";
import { sumAssetsByClass, isBadDebt } from "@/modules/wealth/engine/patrimonio-mappers";
import type { EssentialBreakdown } from "@/modules/wealth/engine/essential-expense";
import {
  computePatrimonio,
  patrimonioLevel,
  millonarioReadings,
  buildPatrimonioDiagnosis,
  type PatrimonioInput,
  type PatrimonioReport,
  type PatrimonioLevel,
  type MillonarioReadings,
  type DiagnosisFlag,
} from "@/modules/wealth/engine/patrimonio-engine";

export type PatrimonioServiceResult = {
  report: PatrimonioReport;
  level: PatrimonioLevel;
  readings: MillonarioReadings;
  diagnosis: DiagnosisFlag[];
  /**
   * Desglose del gasto esencial (origen + primas excluidas por dedup #2), para la
   * transparencia del número de seguridad en la UI. null si la lectura falla o no
   * hay sesión (ruta service-role): la UI degrada sin romperse.
   */
  essentialBreakdown: EssentialBreakdown | null;
  currency: string;
};

/**
 * Variante SIN sesión (cron/push): mismo reporte para `userId` usando el cliente
 * service-role. Filtra siempre por userId explícito (bypassa RLS). Usa moneda
 * primaria (no hay cookie de display). Queda exportada y dormida (cimiento).
 */
export async function getPatrimonioReportForUser(
  userId: string,
): Promise<PatrimonioServiceResult> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  return getPatrimonioReport({ db: createServiceRoleClient(), userId });
}

export async function getPatrimonioReport(ctx?: AuthContext): Promise<PatrimonioServiceResult> {
  // ctx undefined → sesión, idéntico a hoy; ctx presente → service-role + userId.
  const agg = await aggregateNetWorth(ctx);
  const { db, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(db, userId);
  const rates = await getFxRates();
  const currency = agg.currency;

  const assetsByClass = sumAssetsByClass(agg.assets);
  const totalLiabilities = agg.liabilities.reduce((s, l) => s + l.balance, 0);

  const [debtRows, invRows, goalRows, profileRow] = await Promise.all([
    db
      .from("debts")
      .select("classification,apr,min_payment,current_payment,balance,currency")
      .in("user_id", memberIds),
    db
      .from("investments")
      .select("contribution,contribution_frequency")
      .in("user_id", memberIds),
    db
      .from("savings_goals")
      .select("monthly_contribution,current_amount,goal_type,currency")
      .in("user_id", memberIds),
    // Perfil PERSONAL del usuario (no del hogar): edad + estilo de vida deseado.
    db.from("personal_profiles").select("age,extra").eq("user_id", userId).maybeSingle(),
  ]);

  // Pago mensual de deuda MALA (Fuga #3): cuota actual (o mínima) de las deudas
  // caras/críticas con saldo vivo, normalizada a la moneda de display.
  const badDebtMonthlyPayment = (debtRows.data ?? [])
    .filter(
      (d) =>
        Number(d.balance) > 0 && isBadDebt(d.classification, d.apr === null ? null : Number(d.apr)),
    )
    .reduce(
      (s, d) =>
        s +
        convertCurrency(Number(d.current_payment ?? d.min_payment ?? 0), d.currency, currency, rates),
      0,
    );

  // Aporte mensual a inversión: inversiones recurrentes (mensualizadas) + aportes
  // a metas de ahorro. Todo normalizado a la moneda de display.
  // Las inversiones se asumen ya en moneda de display (no tienen columna currency),
  // igual que en rich-life-service.
  const investMonthly = (invRows.data ?? []).reduce((s, r) => {
    const amount = Number(r.contribution ?? 0);
    if (amount <= 0 || !r.contribution_frequency) return s;
    return s + monthlyize(amount, r.contribution_frequency as Frequency); // claves inválidas → 0
  }, 0);
  const goalsMonthly = (goalRows.data ?? []).reduce(
    (s, g) => s + convertCurrency(Number(g.monthly_contribution ?? 0), g.currency, currency, rates),
    0,
  );
  const monthlyInvested = investMonthly + goalsMonthly;

  const age = profileRow.data?.age ?? null;
  const annualNetIncome = agg.netMonthlyIncome * 12;

  // Fondos de DEFENSA (colchón earmarkeado): se restan del líquido en el capital
  // que trabaja. Son el current_amount de las metas defensa:fondo_emergencia/paz.
  const defenseFundsBalance = (goalRows.data ?? [])
    .filter(
      (g) =>
        g.goal_type === "defensa:fondo_emergencia" || g.goal_type === "defensa:fondo_paz",
    )
    .reduce(
      (s, g) => s + convertCurrency(Number(g.current_amount ?? 0), g.currency, currency, rates),
      0,
    );

  // Gasto ESENCIAL mensual (N1) → número de seguridad. Best-effort: la ruta
  // service-role (WhatsApp) no tiene sesión, así que degrada a 0 sin romper.
  // Guardamos el breakdown completo para la transparencia de la UI (fuente única).
  let essentialBreakdown: EssentialBreakdown | null = null;
  try {
    const { getEssentialMonthlyExpense } = await import(
      "@/modules/wealth/services/essential-expense-service"
    );
    essentialBreakdown = await getEssentialMonthlyExpense();
  } catch {
    essentialBreakdown = null;
  }
  const essentialMonthlyExpenses = essentialBreakdown?.total ?? 0;

  // Estilo de vida DESEADO (dato PERSONAL en personal_profiles.extra) → número de
  // libertad. null si no lo definió (nunca se inventa).
  const extra = (profileRow.data?.extra ?? {}) as Record<string, unknown>;
  const desiredRaw = extra.desiredMonthlyLifestyle;
  const desiredMonthlyLifestyle =
    typeof desiredRaw === "number" && desiredRaw > 0 ? desiredRaw : null;

  const input: PatrimonioInput = {
    assetsByClass,
    totalLiabilities,
    protectedCoverage: agg.protection.totalCoverage,
    protectionScore: agg.protection.score,
    monthlyExpenses: agg.monthlyExpenses,
    passiveIncomeMonthly: agg.passiveIncomeMonthly,
    netMonthlyIncome: agg.netMonthlyIncome,
    monthlyInvested,
    badDebtMonthlyPayment,
    diversification: agg.portfolio.diversification,
    topConcentration: agg.portfolio.topConcentration,
    age,
    annualNetIncome,
    essentialMonthlyExpenses,
    desiredMonthlyLifestyle,
    defenseFundsBalance,
    currency,
  };

  const report = computePatrimonio(input);
  return {
    report,
    level: patrimonioLevel(report.indice),
    readings: millonarioReadings(input),
    diagnosis: buildPatrimonioDiagnosis(report),
    essentialBreakdown,
    currency,
  };
}
