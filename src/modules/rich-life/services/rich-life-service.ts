import "server-only";
import { householdMemberIds, householdWriteScope } from "@/lib/household/active";

/**
 * Servicio del Módulo 5 (respeta RLS). Consolida activos, pasivos e ingreso
 * pasivo de todos los módulos para calcular patrimonio neto y Rich Life Score.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import {
  getBaseSummary,
  getDisplayCurrency,
  getPrimaryCurrency,
  getLiquidityBalance,
} from "@/modules/financial-base";
import { computeProtection, computePortfolio } from "@/modules/wealth";
import { buildRichLifeSnapshot } from "@/modules/rich-life/engine/rich-life-engine";
import {
  mapInvestmentLiquidity,
  savingsLiquidity,
} from "@/modules/rich-life/engine/asset-mapping";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { AssetInput, LiabilityInput } from "@/modules/rich-life/schemas";
import type {
  Asset,
  Liability,
  AssetClass,
  LiabilityClass,
  RichLifeSnapshot,
  RichLifeInput,
} from "@/modules/rich-life/types";
import type {
  Investment,
  InsurancePolicy,
  PolicyType,
  ProtectionDiagnosis,
  PortfolioStats,
} from "@/modules/wealth";

async function tryGetPortfolioMarketValues(
  ctx?: AuthContext,
): Promise<Record<string, number>> {
  try {
    const { getPortfolioMarketValues } =
      await import("@/modules/wealth/services/portfolio-service");
    const result = await getPortfolioMarketValues(ctx);
    return result.byInvestmentId;
  } catch {
    return {};
  }
}

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

export async function updateAsset(id: string, input: AssetInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase
    .from("assets")
    .update({ last_edited_by: user.id,
      name: input.name,
      asset_class: input.assetClass,
      value: input.value,
      currency: input.currency,
      generates_income: input.generatesIncome,
      liquidity: input.liquidity ?? null,
    })
    .eq("id", id)
    .in("user_id", scope);
}

export async function updateLiability(id: string, input: LiabilityInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase
    .from("liabilities")
    .update({ last_edited_by: user.id,
      name: input.name,
      liability_class: input.liabilityClass,
      balance: input.balance,
      currency: input.currency,
    })
    .eq("id", id)
    .in("user_id", scope);
}

export async function deleteAsset(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase.from("assets").delete().eq("id", id).in("user_id", scope);
}

export async function deleteLiability(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase.from("liabilities").delete().eq("id", id).in("user_id", scope);
}

const INVESTMENT_CLASS: Record<string, AssetClass> = {
  inmueble: "productivo",
  negocio: "productivo",
};

/** Clave del bucket de holdings sin `investment_id` en getPortfolioMarketValues. */
const STANDALONE_KEY = "_standalone";

/**
 * Valor de UNA inversión y su moneda. El market value (holdings ligados por id)
 * y el `invested_amount` de fallback vienen ambos en moneda PRINCIPAL, así que el
 * activo se etiqueta con esa moneda para que `assetsForEngine` lo convierta bien.
 * NO usa el bucket `_standalone`: ese se cuenta una sola vez aparte (evita que el
 * holding suelto se difunda/duplique en cada inversión sin match).
 */
export function resolveInvestmentValue(
  investment: { id: string; investedAmount: number },
  marketByInvestmentId: Record<string, number>,
  primaryCurrency: string,
): { value: number; currency: string } {
  const marketValue = marketByInvestmentId[investment.id];
  return {
    value: marketValue !== undefined ? marketValue : investment.investedAmount,
    currency: primaryCurrency,
  };
}

export type RichLifeSummary = {
  snapshot: RichLifeSnapshot;
  assets: Asset[]; // solo activos manuales (tabla `assets`), para la UI editable
  /** Activos AGREGADOS y normalizados a la principal (manuales + inversiones + liquidez):
   *  el mismo set que usa el motor de patrimonio. Para desgloses (invertido/líquido/otros). */
  allAssets: Asset[];
  liabilities: Liability[];
  currency: string;
};

/**
 * Núcleo de agregación de patrimonio, reutilizable. Devuelve activos/pasivos ya
 * normalizados a la moneda principal + ingreso pasivo, indicadores base,
 * protección y portfolio. Lo consumen getRichLifeSummary y patrimonio-service.
 */
export type NetWorthAggregate = {
  assets: Asset[]; // normalizados a moneda principal (= assetsForEngine)
  liabilities: Liability[]; // normalizados (= liabsForEngine)
  passiveIncomeMonthly: number;
  monthlyExpenses: number; // base.indicators.expenseMonthly
  netMonthlyIncome: number; // base.indicators.incomeMonthly
  freeCashflow: number;
  protection: ProtectionDiagnosis;
  portfolio: PortfolioStats;
  currency: string;
  // Extras para preservar EXACTO el resultado de getRichLifeSummary:
  explicitAssets: Asset[]; // solo activos manuales (tabla `assets`)
  explicitLiabilities: Liability[]; // solo pasivos manuales (tabla `liabilities`)
  previousNetWorth: number | null; // último snapshot de patrimonio neto
};

export async function aggregateNetWorth(ctx?: AuthContext): Promise<NetWorthAggregate> {
  // ctx undefined → sesión (requireUser + cliente por cookies), idéntico a hoy.
  // ctx presente → cliente service-role + userId explícito (cron/push).
  const { db, userId } = await resolveAuth(ctx);

  const memberIds = await householdMemberIds(db, userId);
  const [base, currency, primaryCurrency, rates] = await Promise.all([
    getBaseSummary(ctx),
    getDisplayCurrency(ctx),
    getPrimaryCurrency(ctx),
    getFxRates(),
  ]);

  const [
    assetRows,
    liabRows,
    debtRows,
    invRows,
    policyRows,
    profileRow,
    prevSnap,
    marketValues,
    liquidityBucket,
    goalRows,
  ] = await Promise.all([
      db.from("assets").select("*").in("user_id", memberIds),
      db.from("liabilities").select("*").in("user_id", memberIds),
      db
        .from("debts")
        .select("id,name,balance,classification,apr,delinquency,currency")
        .in("user_id", memberIds),
      db.from("investments").select("*").in("user_id", memberIds),
      db
        .from("insurance_policies")
        .select("policy_type,coverage,premium,premium_frequency")
        .in("user_id", memberIds),
      db
        .from("personal_profiles")
        .select("dependents_count")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("net_worth_snapshots")
        .select("net_worth,period")
        .eq("user_id", userId)
        .order("period", { ascending: false })
        .limit(1)
        .maybeSingle(),
      tryGetPortfolioMarketValues(ctx),
      // Fase 1 · Patrimonio líquido real: saco de liquidez + metas de ahorro.
      getLiquidityBalance(ctx),
      db
        .from("savings_goals")
        .select("id,name,current_amount,stored_in,status,currency")
        .eq("user_id", userId),
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
    // Valor de mercado (holding ligado por id) o el monto invertido; ambos en
    // moneda PRINCIPAL. No usa el bucket _standalone (se cuenta aparte, abajo).
    const { value, currency: valueCurrency } = resolveInvestmentValue(
      { id: r.id, investedAmount: Number(r.invested_amount) },
      marketValues,
      primaryCurrency,
    );
    return {
      id: "inv-" + r.id,
      name: r.name,
      assetClass: cls,
      value,
      currency: valueCurrency,
      generatesIncome: cls === "productivo",
      // Fuga #2: la liquidez de la inversión ahora se refleja (antes era null).
      liquidity: mapInvestmentLiquidity(r.liquidity),
    };
  });

  // Bug A: el bucket de holdings SIN investment_id (`_standalone`) se cuenta UNA
  // sola vez como un activo de inversión aparte (en moneda principal), en lugar de
  // difundirse como fallback a cada inversión sin match.
  const standaloneValue = marketValues[STANDALONE_KEY];
  const standaloneAssets: Asset[] =
    standaloneValue !== undefined && standaloneValue > 0
      ? [
          {
            id: "inv-standalone",
            name: "Inversiones sin vincular",
            assetClass: "inversion",
            value: standaloneValue,
            currency: primaryCurrency,
            generatesIncome: false,
            liquidity: null,
          },
        ]
      : [];

  // Fuga #1 · Patrimonio líquido real: el saco de liquidez (no asignado) y las
  // metas de ahorro (asignado pero líquido) cuentan como activos líquidos.
  // Disjuntos del saco por construcción (aportar a una meta es un gasto que ya
  // bajó el saco en Fase 0), así que no hay doble conteo.
  const liquidityAssets: Asset[] = [];
  if (liquidityBucket.hasOpening) {
    liquidityAssets.push({
      id: "liquidity-saco",
      name: "Tu Liquidez",
      assetClass: "liquido",
      value: liquidityBucket.balance,
      currency: liquidityBucket.currency,
      generatesIncome: false,
      liquidity: "alta",
    });
  }
  for (const g of goalRows.data ?? []) {
    const amount = Number(g.current_amount);
    if (amount > 0) {
      liquidityAssets.push({
        id: "goal-" + g.id,
        name: g.name,
        assetClass: "liquido",
        value: amount,
        currency: g.currency,
        generatesIncome: false,
        liquidity: savingsLiquidity(g.stored_in),
      });
    }
  }

  const assets = [...explicitAssets, ...investmentAssets, ...standaloneAssets, ...liquidityAssets];

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
      // Bug C: la deuda se etiqueta con su moneda REAL (antes display, sin convertir).
      currency: d.currency,
    }));
  const liabilities = [...explicitLiabs, ...debtLiabs];

  // Ingreso pasivo mensual (normalizado a la moneda principal).
  const passiveIncomeMonthly = base.incomes
    .filter((i) => i.incomeType === "pasivo" && i.includeInBudget)
    .reduce((s, i) => s + convertCurrency(i.amountMonthly, i.currency, currency, rates), 0);

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
    (d) =>
      Number(d.balance) > 0 &&
      (Number(d.apr ?? 0) >= 30 || (d.delinquency && d.delinquency !== "no")),
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
      // Vista secundaria (Rich Life): no consulta metas, así que reutiliza el
      // mismo proxy de liquidez para el fondo de paz. La pantalla autoritativa
      // de protección (Patrimonio) sí detecta ambos fondos por goal_type.
      hasPeaceFund: assets.some((a) => a.assetClass === "liquido"),
      hasCriticalDebt,
      dependents: profileRow.data?.dependents_count ?? 0,
      riskClassKnown: true,
      currency,
    },
    policies,
  );
  const portfolio = computePortfolio(investments);

  // El motor agrega patrimonio: normalizamos valores a la moneda principal.
  const assetsForEngine = assets.map((a) => ({
    ...a,
    value: convertCurrency(a.value, a.currency, currency, rates),
  }));
  const liabsForEngine = liabilities.map((l) => ({
    ...l,
    balance: convertCurrency(l.balance, l.currency, currency, rates),
  }));

  return {
    assets: assetsForEngine,
    liabilities: liabsForEngine,
    passiveIncomeMonthly,
    monthlyExpenses: base.indicators.expenseMonthly,
    netMonthlyIncome: base.indicators.incomeMonthly,
    freeCashflow: base.indicators.freeCashflow,
    protection,
    portfolio,
    currency,
    explicitAssets,
    explicitLiabilities: explicitLiabs,
    previousNetWorth: prevSnap.data ? Number(prevSnap.data.net_worth) : null,
  };
}

/**
 * Resumen Rich Life: arma el snapshot a partir de la agregación de patrimonio.
 * Comportamiento idéntico al previo (solo se extrajo aggregateNetWorth).
 */
export async function getRichLifeSummary(): Promise<RichLifeSummary> {
  const agg = await aggregateNetWorth();
  const input: RichLifeInput = {
    assets: agg.assets,
    liabilities: agg.liabilities,
    passiveIncomeMonthly: agg.passiveIncomeMonthly,
    monthlyExpenses: agg.monthlyExpenses,
    freeCashflow: agg.freeCashflow,
    protectionScore: agg.protection.score,
    diversification: agg.portfolio.diversification,
    previous: agg.previousNetWorth !== null ? { netWorth: agg.previousNetWorth } : null,
    currency: agg.currency,
  };
  const snapshot = buildRichLifeSnapshot(input);
  return {
    snapshot,
    assets: agg.explicitAssets,
    allAssets: agg.assets,
    liabilities: agg.explicitLiabilities,
    currency: agg.currency,
  };
}

/** Resumen Rich Life de demostración (no toca la BD). */
export function buildDemoRichLifeSummary(): RichLifeSummary {
  const currency = "CRC";
  const assets: Asset[] = [
    {
      id: "a1",
      name: "Fondo de emergencia",
      assetClass: "liquido",
      value: 3_000_000,
      currency,
      generatesIncome: false,
      liquidity: "alta",
    },
    {
      id: "a2",
      name: "ETF S&P 500",
      assetClass: "inversion",
      value: 4_200_000,
      currency,
      generatesIncome: false,
      liquidity: "media",
    },
    {
      id: "a3",
      name: "Apartamento alquiler",
      assetClass: "productivo",
      value: 38_000_000,
      currency,
      generatesIncome: true,
      liquidity: "baja",
    },
    {
      id: "a4",
      name: "Vehículo",
      assetClass: "uso_personal",
      value: 9_000_000,
      currency,
      generatesIncome: false,
      liquidity: "media",
    },
  ];
  const liabilities: Liability[] = [
    {
      id: "l1",
      name: "Tarjeta de crédito",
      liabilityClass: "critico",
      balance: 1_400_000,
      currency,
    },
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
  return { snapshot: buildRichLifeSnapshot(input), assets, allAssets: assets, liabilities, currency };
}
