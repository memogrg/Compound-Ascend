import "server-only";

/** Servicio del Módulo 4 (respeta RLS). Cruza Base, Control y Perfil. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import {
  computeReadiness,
  computeProtection,
  computeBalance,
  computePortfolio,
} from "@/modules/wealth/engine/wealth-engine";
import { getMarketPrice, type AssetType as MarketAssetType } from "@/lib/market-data";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { InvestmentInput, PolicyInput } from "@/modules/wealth/schemas";
import { listHoldings } from "@/modules/wealth/services/holdings-service";
import type {
  Investment,
  InsurancePolicy,
  Holding,
  InvestmentReadiness,
  ProtectionDiagnosis,
  Balance,
  PortfolioStats,
  AssetType,
  PolicyType,
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
    currency: "CRC",
    horizon: r.horizon,
    perceivedRisk: r.perceived_risk as Investment["perceivedRisk"],
    liquidity: r.liquidity as Investment["liquidity"],
  };
}

function rowToPolicy(r: InsurancePolicyRow): InsurancePolicy {
  return {
    id: r.id,
    policyType: (r.policy_type ?? "otro") as PolicyType,
    provider: r.provider,
    coverage: r.coverage === null ? null : Number(r.coverage),
    premium: r.premium === null ? null : Number(r.premium),
    premiumFrequency: r.premium_frequency,
    renewalDate: r.renewal_date,
    currency: r.currency,
  };
}

export async function listInvestments(): Promise<Investment[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToInvestment);
}

export async function listPolicies(): Promise<InsurancePolicy[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToPolicy);
}

export async function createInvestment(input: InvestmentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("investments").insert({
    user_id: user.id,
    asset_type: input.assetType,
    name: input.name,
    symbol: input.symbol ?? null,
    invested_amount: input.investedAmount,
    contribution: input.contribution,
    horizon: input.horizon ?? null,
    perceived_risk: input.perceivedRisk ?? null,
    liquidity: input.liquidity ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function createPolicy(input: PolicyInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("insurance_policies").insert({
    user_id: user.id,
    policy_type: input.policyType,
    provider: input.provider ?? null,
    coverage: input.coverage ?? null,
    premium: input.premium ?? null,
    premium_frequency: input.premiumFrequency ?? null,
    renewal_date: input.renewalDate ?? null,
    currency: input.currency,
  });
  if (error) throw new Error(error.message);
}

export async function updateInvestment(id: string, input: InvestmentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("investments")
    .update({
      asset_type: input.assetType,
      name: input.name,
      symbol: input.symbol ?? null,
      invested_amount: input.investedAmount,
      contribution: input.contribution,
      horizon: input.horizon ?? null,
      perceived_risk: input.perceivedRisk ?? null,
      liquidity: input.liquidity ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function updatePolicy(id: string, input: PolicyInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("insurance_policies")
    .update({
      policy_type: input.policyType,
      provider: input.provider ?? null,
      coverage: input.coverage ?? null,
      premium: input.premium ?? null,
      premium_frequency: input.premiumFrequency ?? null,
      currency: input.currency,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function deleteInvestment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("investments").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function deletePolicy(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("insurance_policies").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
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
  holdings: Holding[];
  policies: InsurancePolicy[];
  prices: Record<string, { price: number; currency: string }>;
  currency: string;
};

export async function getWealthSummary(): Promise<WealthSummary> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [investments, policies, holdings, base, currency, rates] = await Promise.all([
    listInvestments(),
    listPolicies(),
    listHoldings(),
    getBaseSummary(),
    getDisplayCurrency(),
    getFxRates(),
  ]);

  const [{ data: profile }, { data: risk }, { data: goals }, { data: debts }] = await Promise.all([
    supabase.from("personal_profiles").select("dependents_count").eq("user_id", user.id).maybeSingle(),
    supabase.from("risk_profiles").select("risk_class").eq("user_id", user.id).maybeSingle(),
    supabase.from("savings_goals").select("name,current_amount").eq("user_id", user.id),
    supabase.from("debts").select("apr,delinquency,balance").eq("user_id", user.id),
  ]);

  const hasEmergencyFund = (goals ?? []).some(
    (g) => /emergencia|paz/i.test(g.name ?? "") && Number(g.current_amount) > 0,
  );
  const hasCriticalDebt = (debts ?? []).some(
    (d) => Number(d.balance) > 0 && (Number(d.apr ?? 0) >= 30 || (d.delinquency && d.delinquency !== "no")),
  );

  const ctx = {
    freeCashflow: base.indicators.freeCashflow,
    hasEmergencyFund,
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
    coverage: p.coverage == null ? p.coverage : convertCurrency(p.coverage, p.currency, currency, rates),
    premium: p.premium == null ? p.premium : convertCurrency(p.premium, p.currency, currency, rates),
  }));

  const readiness = computeReadiness(ctx, investments);
  const protection = computeProtection(ctx, policiesForEngine);
  const portfolio = computePortfolio(investments);
  const balance = computeBalance(readiness, protection, investments.length > 0);
  const prices = await getLivePrices(investments);

  return { readiness, protection, balance, portfolio, investments, holdings, policies, prices, currency };
}

/** Resumen patrimonial de demostración (no toca la BD ni proveedores). */
export function buildDemoWealthSummary(): WealthSummary {
  const currency = "CRC";
  const investments: Investment[] = [
    { id: "i1", assetType: "etf", name: "ETF S&P 500", symbol: "VOO", investedAmount: 4_200_000, contribution: 120_000, currency, horizon: "mas_5" },
    { id: "i2", assetType: "cripto", name: "Bitcoin", symbol: "BTC", investedAmount: 1_100_000, contribution: 30_000, currency, horizon: "mas_5" },
    { id: "i3", assetType: "inmueble", name: "Apartamento alquiler", investedAmount: 38_000_000, contribution: 0, currency, horizon: "mas_10" },
  ];
  const policies: InsurancePolicy[] = [
    { id: "p1", policyType: "vida", provider: "Aseguradora", coverage: 90_000_000, premium: 18_000, premiumFrequency: "mensual", currency },
    { id: "p2", policyType: "medico", provider: "Aseguradora", coverage: 50_000_000, premium: 35_000, premiumFrequency: "mensual", currency },
    { id: "p3", policyType: "vehiculo", provider: "Aseguradora", coverage: 12_000_000, premium: 22_000, premiumFrequency: "mensual", currency },
  ];
  const ctx = {
    freeCashflow: 175_000,
    hasEmergencyFund: true,
    hasCriticalDebt: false,
    dependents: 2,
    riskClassKnown: true,
    currency,
  };
  const readiness = computeReadiness(ctx, investments);
  const protection = computeProtection(ctx, policies);
  const portfolio = computePortfolio(investments);
  const balance = computeBalance(readiness, protection, true);
  return { readiness, protection, balance, portfolio, investments, holdings: [], policies, prices: {}, currency };
}
