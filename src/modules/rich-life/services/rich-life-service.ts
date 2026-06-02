import "server-only";

/**
 * Servicio del Módulo 5 (respeta RLS). Consolida activos, pasivos e ingreso
 * pasivo de todos los módulos para calcular patrimonio neto y Rich Life Score.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getBaseSummary, getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { computeProtection, computePortfolio } from "@/modules/wealth/engine/wealth-engine";
import { buildRichLifeSnapshot } from "@/modules/rich-life/engine/rich-life-engine";
import type { AssetInput, LiabilityInput } from "@/modules/rich-life/schemas";
import type {
  Asset,
  Liability,
  AssetClass,
  LiabilityClass,
  RichLifeSnapshot,
  RichLifeInput,
} from "@/modules/rich-life/types";
import type { Investment, InsurancePolicy, PolicyType } from "@/modules/wealth/types";

export async function createAsset(input: AssetInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("assets").insert({
    user_id: user.id,
    name: input.name,
    asset_class: input.assetClass,
    value: input.value,
    currency: input.currency,
    generates_income: input.generatesIncome,
    liquidity: input.liquidity ?? null,
  });
}

export async function createLiability(input: LiabilityInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("liabilities").insert({
    user_id: user.id,
    name: input.name,
    liability_class: input.liabilityClass,
    balance: input.balance,
    currency: input.currency,
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("assets").delete().eq("id", id).eq("user_id", user.id);
}

export async function deleteLiability(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("liabilities").delete().eq("id", id).eq("user_id", user.id);
}

const INVESTMENT_CLASS: Record<string, AssetClass> = {
  inmueble: "productivo",
  negocio: "productivo",
};

export type RichLifeSummary = {
  snapshot: RichLifeSnapshot;
  assets: Asset[];
  liabilities: Liability[];
  currency: string;
};

export async function getRichLifeSummary(): Promise<RichLifeSummary> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [base, currency] = await Promise.all([getBaseSummary(), getPrimaryCurrency()]);

  const [assetRows, liabRows, debtRows, invRows, policyRows, profileRow, prevSnap] =
    await Promise.all([
      supabase.from("assets").select("*").eq("user_id", user.id),
      supabase.from("liabilities").select("*").eq("user_id", user.id),
      supabase.from("debts").select("id,name,balance,classification,apr,delinquency").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id),
      supabase.from("insurance_policies").select("policy_type,coverage,premium,premium_frequency").eq("user_id", user.id),
      supabase.from("personal_profiles").select("dependents_count").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("net_worth_snapshots")
        .select("net_worth,period")
        .eq("user_id", user.id)
        .order("period", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Activos: explícitos + inversiones.
  const explicitAssets: Asset[] = (assetRows.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    assetClass: (r.asset_class ?? "uso_personal") as AssetClass,
    value: Number(r.value),
    currency: r.currency,
    generatesIncome: r.generates_income ?? false,
    liquidity: r.liquidity as Asset["liquidity"],
  }));
  const investmentAssets: Asset[] = (invRows.data ?? []).map((r) => {
    const cls = INVESTMENT_CLASS[r.asset_type] ?? "inversion";
    return {
      id: "inv-" + r.id,
      name: r.name,
      assetClass: cls,
      value: Number(r.invested_amount),
      currency: currency,
      generatesIncome: cls === "productivo",
      liquidity: null,
    };
  });
  const assets = [...explicitAssets, ...investmentAssets];

  // Pasivos: explícitos + deudas.
  const explicitLiabs: Liability[] = (liabRows.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    liabilityClass: (r.liability_class ?? "consumo") as LiabilityClass,
    balance: Number(r.balance),
    currency: r.currency,
  }));
  const debtLiabs: Liability[] = (debtRows.data ?? [])
    .filter((d) => Number(d.balance) > 0)
    .map((d) => ({
      id: "debt-" + d.id,
      name: d.name,
      liabilityClass: (d.classification === "critica"
        ? "critico"
        : d.classification === "estrategica"
          ? "patrimonial"
          : "consumo") as LiabilityClass,
      balance: Number(d.balance),
      currency,
    }));
  const liabilities = [...explicitLiabs, ...debtLiabs];

  // Ingreso pasivo mensual.
  const passiveIncomeMonthly = base.incomes
    .filter((i) => i.incomeType === "pasivo" && i.includeInBudget)
    .reduce((s, i) => s + i.amountMonthly, 0);

  // Protección y diversificación (reutiliza motores de Patrimonio).
  const policies: InsurancePolicy[] = (policyRows.data ?? []).map((p, i) => ({
    id: String(i),
    policyType: (p.policy_type ?? "otro") as PolicyType,
    coverage: p.coverage === null ? null : Number(p.coverage),
    premium: p.premium === null ? null : Number(p.premium),
    premiumFrequency: p.premium_frequency,
    currency,
  }));
  const hasCriticalDebt = (debtRows.data ?? []).some(
    (d) => Number(d.balance) > 0 && (Number(d.apr ?? 0) >= 30 || (d.delinquency && d.delinquency !== "no")),
  );
  const investments: Investment[] = (invRows.data ?? []).map((r) => ({
    id: r.id,
    assetType: r.asset_type as Investment["assetType"],
    name: r.name,
    investedAmount: Number(r.invested_amount),
    contribution: Number(r.contribution ?? 0),
    currency,
  }));
  const protection = computeProtection(
    {
      freeCashflow: base.indicators.freeCashflow,
      hasEmergencyFund: assets.some((a) => a.assetClass === "liquido"),
      hasCriticalDebt,
      dependents: profileRow.data?.dependents_count ?? 0,
      riskClassKnown: true,
      currency,
    },
    policies,
  );
  const portfolio = computePortfolio(investments);

  const input: RichLifeInput = {
    assets,
    liabilities,
    passiveIncomeMonthly,
    monthlyExpenses: base.indicators.expenseMonthly,
    freeCashflow: base.indicators.freeCashflow,
    protectionScore: protection.score,
    diversification: portfolio.diversification,
    previous: prevSnap.data ? { netWorth: Number(prevSnap.data.net_worth) } : null,
    currency,
  };

  const snapshot = buildRichLifeSnapshot(input);
  return { snapshot, assets: explicitAssets, liabilities: explicitLiabs, currency };
}

/** Resumen Rich Life de demostración (no toca la BD). */
export function buildDemoRichLifeSummary(): RichLifeSummary {
  const currency = "CRC";
  const assets: Asset[] = [
    { id: "a1", name: "Fondo de emergencia", assetClass: "liquido", value: 3_000_000, currency, generatesIncome: false, liquidity: "alta" },
    { id: "a2", name: "ETF S&P 500", assetClass: "inversion", value: 4_200_000, currency, generatesIncome: false, liquidity: "media" },
    { id: "a3", name: "Apartamento alquiler", assetClass: "productivo", value: 38_000_000, currency, generatesIncome: true, liquidity: "baja" },
    { id: "a4", name: "Vehículo", assetClass: "uso_personal", value: 9_000_000, currency, generatesIncome: false, liquidity: "media" },
  ];
  const liabilities: Liability[] = [
    { id: "l1", name: "Tarjeta de crédito", liabilityClass: "critico", balance: 1_400_000, currency },
    { id: "l2", name: "Hipoteca", liabilityClass: "patrimonial", balance: 22_000_000, currency },
  ];
  const input: RichLifeInput = {
    assets,
    liabilities,
    passiveIncomeMonthly: 250_000,
    monthlyExpenses: 925_000,
    freeCashflow: 175_000,
    protectionScore: 75,
    diversification: "media",
    previous: { netWorth: 29_500_000 },
    currency,
  };
  return { snapshot: buildRichLifeSnapshot(input), assets, liabilities, currency };
}
