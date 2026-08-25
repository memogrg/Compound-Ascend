import "server-only";
import { householdMemberIds, householdWriteScope } from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";

/** Servicio del Módulo 4 (respeta RLS). Cruza Base, Control y Perfil. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import {
  getBaseSummary,
  getDisplayCurrency,
  getPrimaryCurrency,
  registerLinkedTransaction,
  getSystemCategoryId,
  policyPremiumToTxn,
} from "@/modules/financial-base";
import { monedaDelMovimientoEsCoherente } from "@/modules/wealth/engine/portfolio-engine";
import {
  computeReadiness,
  computeProtection,
  computeBalance,
  computePortfolio,
} from "@/modules/wealth";
import { getMarketPrice, type AssetType as MarketAssetType } from "@/lib/market-data";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { InvestmentInput, PolicyInput, PolicyPremiumInput } from "@/modules/wealth/schemas";
import { listHoldings } from "@/modules/wealth/services/holdings-service";
import type {
  Investment,
  InsurancePolicy,
  InvestmentReadiness,
  ProtectionDiagnosis,
  Balance,
  PortfolioStats,
  AssetType,
  PolicyType,
  HoldingNativo,
} from "@/modules/wealth/types";
import type { InvestmentRow, InsurancePolicyRow } from "@/lib/supabase/database.types";

function rowToInvestment(r: InvestmentRow): Investment {
  return {
    id: r.id,
    assetType: r.asset_type as AssetType,
    name: r.name,
    symbol: r.symbol,
    investedAmount: Number(r.invested_amount),
    contribution: Number(r.contribution ?? 0),
    // Delta 3b: la moneda real de la columna (antes se falseaba "CRC"). El `?? "CRC"` es un
    // último recurso inerte: post-backfill toda fila la tiene y create/update siempre la escriben.
    currency: r.currency ?? "CRC",
    horizon: r.horizon,
    perceivedRisk: r.perceived_risk as Investment["perceivedRisk"],
    liquidity: r.liquidity as Investment["liquidity"],
  };
}

/**
 * Delta 3b: copia de la lista con los importes CONVERTIDOS a `currency` (patrón assetsForEngine).
 * Para darle al motor puro `computePortfolio` un total que NO mezcle monedas; la lista CRUDA (cada
 * inversión en su moneda) se conserva aparte para el display por fila.
 */
export function investmentsInCurrency(
  investments: Investment[],
  currency: string,
  rates: Record<string, number>,
): Investment[] {
  return investments.map((inv) => ({
    ...inv,
    investedAmount: convertCurrency(inv.investedAmount, inv.currency, currency, rates),
    contribution: convertCurrency(inv.contribution, inv.currency, currency, rates),
  }));
}

function rowToPolicy(r: InsurancePolicyRow): InsurancePolicy {
  return {
    isEssential: r.is_essential,
    id: r.id,
    policyType: (r.policy_type ?? "otro") as PolicyType,
    provider: r.provider,
    coverage: r.coverage === null ? null : Number(r.coverage),
    premium: r.premium === null ? null : Number(r.premium),
    premiumFrequency: r.premium_frequency,
    renewalDate: r.renewal_date,
    currency: r.currency,
    fundingReference: r.funding_reference,
  };
}

export async function listInvestments(ctx?: AuthContext): Promise<Investment[]> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);
  const { data } = await supabase
    .from("investments")
    .select("*")
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToInvestment);
}

export async function listPolicies(ctx?: AuthContext): Promise<InsurancePolicy[]> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);
  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToPolicy);
}

/**
 * Pago manual de la prima de un seguro EXISTENTE (el "+" de Defensa). Una póliza no tiene
 * saldo ni ledger de pagos: el pago es UNA sola escritura —la transacción vinculada— que es
 * de donde el frasco de Defensa lee el gastado del mes. No hay flujo AUTOMÁTICO de primas de
 * póliza (ensureMonthlyPremiums es solo para planes de inversión), así que esto no duplica
 * nada; es el modelo de las deudas (presupuesto derivado + pago manual).
 *
 * La moneda la impone la póliza (misma guarda que la venta de inversión): un importe que la
 * contradiga se rechaza en vez de guardarse contra una referencia equivocada.
 */
export async function payPolicyPremium(
  input: PolicyPremiumInput,
  ctx?: AuthContext,
): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);

  const { data: row, error } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("id", input.policyId)
    .in("user_id", memberIds)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Póliza no encontrada");
  const policy = rowToPolicy(row);

  if (!monedaDelMovimientoEsCoherente(input.currency, policy.currency)) {
    throw new Error(
      `La prima viene en ${input.currency} pero el seguro está en ${policy.currency}.`,
    );
  }

  await registerLinkedTransaction(
    policyPremiumToTxn({
      policyId: policy.id,
      policyName: input.policyName?.trim() || policy.provider || "Seguro",
      currency: policy.currency,
      paymentDate: input.paymentDate,
      amount: input.amount,
      categoryId: await getSystemCategoryId("seguros", ctx),
    }),
    ctx,
  );
}

export async function createInvestment(input: InvestmentInput, ctx?: AuthContext): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  // Delta 3b (#437): la moneda se persiste (antes se descartaba). Resuelta a la PRINCIPAL si el
  // input la omite — nunca CRC hard-coded (patrón A).
  const currency = input.currency ?? (await getPrimaryCurrency(ctx));
  const { error } = await supabase.from("investments").insert({
    user_id: userId,
    asset_type: input.assetType,
    name: input.name,
    symbol: input.symbol ?? null,
    invested_amount: input.investedAmount,
    contribution: input.contribution,
    currency,
    horizon: input.horizon ?? null,
    perceived_risk: input.perceivedRisk ?? null,
    liquidity: input.liquidity ?? null,
    dca_broker: input.dcaBroker ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Crea una póliza y devuelve su id (el id permite vincular una meta de ahorro). */
export async function createPolicy(input: PolicyInput, ctx?: AuthContext): Promise<string> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const { data, error } = await supabase
    .from("insurance_policies")
    .insert({
      user_id: userId,
      policy_type: input.policyType,
      provider: input.provider ?? null,
      coverage: input.coverage ?? null,
      premium: input.premium ?? null,
      premium_frequency: input.premiumFrequency ?? null,
      renewal_date: input.renewalDate ?? null,
      currency: input.currency,
      is_essential: input.isEssential ?? false,
      funding_reference: input.fundingReference ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

export async function updateInvestment(
  id: string,
  input: InvestmentInput,
  ctx?: AuthContext,
): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const scope = await householdWriteScope(supabase, userId);
  const currency = input.currency ?? (await getPrimaryCurrency(ctx));
  const { error } = await supabase
    .from("investments")
    .update({
      last_edited_by: userId,
      asset_type: input.assetType,
      name: input.name,
      symbol: input.symbol ?? null,
      invested_amount: input.investedAmount,
      contribution: input.contribution,
      currency,
      horizon: input.horizon ?? null,
      perceived_risk: input.perceivedRisk ?? null,
      liquidity: input.liquidity ?? null,
      dca_broker: input.dcaBroker ?? null,
    })
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
}

export async function updatePolicy(id: string, input: PolicyInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase
    .from("insurance_policies")
    .update({
      last_edited_by: user.id,
      policy_type: input.policyType,
      provider: input.provider ?? null,
      coverage: input.coverage ?? null,
      premium: input.premium ?? null,
      premium_frequency: input.premiumFrequency ?? null,
      currency: input.currency,
      is_essential: input.isEssential ?? false,
      funding_reference: input.fundingReference ?? null,
    })
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
}

export async function deleteInvestment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase.from("investments").delete().eq("id", id).in("user_id", scope);
  if (error) throw new Error(error.message);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "investments", rowId: id });
}

export async function deletePolicy(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase
    .from("insurance_policies")
    .delete()
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "insurance_policies", rowId: id });
}

const MARKET_TYPE: Partial<Record<AssetType, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/** Precio en vivo por símbolo (best-effort) para inversiones cotizables. */
export async function getLivePrices(
  investments: Investment[],
): Promise<Record<string, { price: number; currency: string }>> {
  const out: Record<string, { price: number; currency: string }> = {};
  const quotable = investments.filter((i) => i.symbol && MARKET_TYPE[i.assetType]);
  await Promise.all(
    quotable.map(async (i) => {
      const mt = MARKET_TYPE[i.assetType]!;
      const p = await getMarketPrice(i.symbol!, mt);
      if (p) out[i.symbol!] = { price: p.price, currency: p.currency };
    }),
  );
  return out;
}

export type WealthSummary = {
  readiness: InvestmentReadiness;
  protection: ProtectionDiagnosis;
  balance: Balance;
  portfolio: PortfolioStats;
  investments: Investment[];
  /** CRUDOS: salen de `listHoldings()` sin pasar por `normalizeHoldings`. Aquí solo se
   *  convierten las pólizas. */
  holdings: HoldingNativo[];
  policies: InsurancePolicy[];
  prices: Record<string, { price: number; currency: string }>;
  currency: string;
};

export async function getWealthSummary(ctx?: AuthContext): Promise<WealthSummary> {
  const { db: supabase, userId } = await resolveAuth(ctx);

  const memberIds = await householdMemberIds(supabase, userId);
  const [investments, policies, holdings, base, currency, rates] = await Promise.all([
    listInvestments(ctx),
    listPolicies(ctx),
    listHoldings(ctx),
    getBaseSummary(ctx),
    getDisplayCurrency(ctx),
    getFxRates(),
  ]);

  const [{ data: profile }, { data: risk }, { data: goals }, { data: debts }] = await Promise.all([
    supabase
      .from("personal_profiles")
      .select("dependents_count")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("risk_profiles").select("risk_class").eq("user_id", userId).maybeSingle(),
    // Metas y deudas: datos del HOGAR (display). Los perfiles de arriba siguen
    // por user_id — son 1 fila por persona y .maybeSingle() reventaría con dos.
    supabase.from("savings_goals").select("name,current_amount,goal_type").in("user_id", memberIds),
    supabase.from("debts").select("apr,delinquency,balance").in("user_id", memberIds),
  ]);

  // Canónico: solo el fondo FORMAL (goal_type), consistente con deriveFundAmounts y
  // getDefenseFundsReport. Un goal genérico llamado "emergencia" ya no cuenta.
  const hasEmergencyFund = (goals ?? []).some(
    (g) => g.goal_type === "defensa:fondo_emergencia" && Number(g.current_amount) > 0,
  );
  const hasPeaceFund = (goals ?? []).some(
    (g) => g.goal_type === "defensa:fondo_paz" && Number(g.current_amount) > 0,
  );
  const hasCriticalDebt = (debts ?? []).some(
    (d) =>
      Number(d.balance) > 0 &&
      (Number(d.apr ?? 0) >= 30 || (d.delinquency && d.delinquency !== "no")),
  );

  // Contexto para los motores (readiness/protección). Renombrado desde `ctx` para no
  // colisionar con el AuthContext inyectable; es un objeto de cómputo, no de auth.
  const engineCtx = {
    freeCashflow: base.indicators.freeCashflow,
    hasEmergencyFund,
    hasPeaceFund,
    hasCriticalDebt,
    dependents: profile?.dependents_count ?? 0,
    riskClassKnown: Boolean(risk?.risk_class),
    currency,
  };

  // El diagnóstico de protección suma cobertura y primas: normalizamos cada
  // póliza a la moneda principal antes de agregar (las inversiones no guardan
  // moneda por ítem, se asumen en la moneda principal).
  const policiesForEngine = policies.map((p) => ({
    ...p,
    coverage:
      p.coverage == null ? p.coverage : convertCurrency(p.coverage, p.currency, currency, rates),
    premium:
      p.premium == null ? p.premium : convertCurrency(p.premium, p.currency, currency, rates),
  }));

  const readiness = computeReadiness(engineCtx, investments);
  const protection = computeProtection(engineCtx, policiesForEngine);
  // Delta 3b: el total del portafolio se computa sobre importes convertidos (no mezcla monedas);
  // `investments` cruda sigue yendo al summary para el display por fila en su propia moneda.
  const portfolio = computePortfolio(investmentsInCurrency(investments, currency, rates));
  const balance = computeBalance(readiness, protection, investments.length > 0);
  const prices = await getLivePrices(investments);

  return {
    readiness,
    protection,
    balance,
    portfolio,
    investments,
    holdings,
    policies,
    prices,
    currency,
  };
}

/** Resumen patrimonial de demostración (no toca la BD ni proveedores). */
export function buildDemoWealthSummary(): WealthSummary {
  const currency = "CRC";
  const investments: Investment[] = [
    {
      id: "i1",
      assetType: "etf",
      name: "ETF S&P 500",
      symbol: "VOO",
      investedAmount: 4_200_000,
      contribution: 120_000,
      currency,
      horizon: "mas_5",
    },
    {
      id: "i2",
      assetType: "cripto",
      name: "Bitcoin",
      symbol: "BTC",
      investedAmount: 1_100_000,
      contribution: 30_000,
      currency,
      horizon: "mas_5",
    },
    {
      id: "i3",
      assetType: "inmueble",
      name: "Apartamento alquiler",
      investedAmount: 38_000_000,
      contribution: 0,
      currency,
      horizon: "mas_10",
    },
  ];
  const policies: InsurancePolicy[] = [
    {
      id: "p1",
      policyType: "vida",
      provider: "Aseguradora",
      coverage: 90_000_000,
      premium: 18_000,
      premiumFrequency: "mensual",
      currency,
    },
    {
      id: "p2",
      policyType: "gastos_mayores",
      provider: "Aseguradora",
      coverage: 50_000_000,
      premium: 35_000,
      premiumFrequency: "mensual",
      currency,
    },
    {
      id: "p3",
      policyType: "vehiculo",
      provider: "Aseguradora",
      coverage: 12_000_000,
      premium: 22_000,
      premiumFrequency: "mensual",
      currency,
    },
  ];
  const ctx = {
    freeCashflow: 175_000,
    hasEmergencyFund: true,
    hasPeaceFund: true,
    hasCriticalDebt: false,
    dependents: 2,
    riskClassKnown: true,
    currency,
  };
  const readiness = computeReadiness(ctx, investments);
  const protection = computeProtection(ctx, policies);
  const portfolio = computePortfolio(investments);
  const balance = computeBalance(readiness, protection, true);
  return {
    readiness,
    protection,
    balance,
    portfolio,
    investments,
    holdings: [] as HoldingNativo[],
    policies,
    prices: {},
    currency,
  };
}
