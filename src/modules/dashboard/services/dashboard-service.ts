import "server-only";

/** Reúne los datos del panel desde los módulos disponibles. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import { computeBaseIndicators } from "@/modules/financial-base";
import { computeHealthScore, type HealthScore } from "@/modules/financial-base";
import { buildInsights, type DashboardInsights } from "@/modules/dashboard/engine/insights";
import { getControlSummary, type ControlSummary } from "@/modules/control";
import { getRichLifeSummary, buildDemoRichLifeSummary, type RichLifeSummary } from "@/modules/rich-life";
import { getWealthSummary, buildDemoWealthSummary, type WealthSummary } from "@/modules/wealth";
import { buildPanel, type PanelVM } from "@/modules/dashboard/engine/pillars";
import type { BaseSummary } from "@/modules/financial-base";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base";

export type DashboardData = {
  name: string;
  currency: string;
  summary: BaseSummary;
  health: HealthScore;
  insights: DashboardInsights;
  panel: PanelVM;
  configured: boolean;
};

export async function getDashboardData(
  opts: { previewDemo?: boolean } = {},
): Promise<DashboardData> {
  // previewDemo (solo para vistas de PREVIEW sin sesión, p. ej. el móvil en dev):
  // fuerza el mismo camino de DEMO que cuando Supabase no está configurado, sin
  // tocar el resto de la lógica. Opt-in y off por defecto → la web no cambia.
  const configured = isSupabaseConfigured() && !opts.previewDemo;
  const user = opts.previewDemo ? null : await getUser();

  let summary: BaseSummary;
  let currency = "CRC";
  // Nombre del perfil (el del wizard "¿Cómo querés que te llamemos?"). Prioriza
  // la tabla profiles porque user_metadata puede venir vacío aunque el usuario
  // sí lo haya configurado.
  let profileName: string | null = null;
  if (configured) {
    // El nombre del perfil no depende del summary: va en el mismo lote.
    const profilePromise = user
      ? (async () => {
          const supabase = await createSupabaseServerClient();
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle();
          return profile?.display_name ?? null;
        })()
      : Promise.resolve(null);
    [summary, currency, profileName] = await Promise.all([
      getBaseSummary(),
      getDisplayCurrency(),
      profilePromise,
    ]);
  } else {
    // Modo demostración (sin Supabase): datos de ejemplo claramente etiquetados
    // en la UI, para previsualizar el panel premium. Se reemplazan por datos
    // reales al conectar Supabase y capturar tu base.
    summary = buildDemoSummary();
  }

  const name =
    profileName ??
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "tu perfil";

  // Pasa la tasa de inversión activa para que contribuya al health score.
  const health = computeHealthScore(summary.indicators, summary.indicators.investmentRate);
  const insights = buildInsights(summary.indicators, health, currency);

  // Resúmenes de los otros pilares para la franja Norte y los 4 pilares.
  // Best-effort y en paralelo: si un módulo falla, el panel degrada con gracia.
  let control: ControlSummary | null = null;
  let richLife: RichLifeSummary | null = null;
  let wealth: WealthSummary | null = null;
  if (configured && user) {
    [control, richLife, wealth] = await Promise.all([
      getControlSummary().catch(() => null),
      getRichLifeSummary().catch(() => null),
      getWealthSummary().catch(() => null),
    ]);
  } else if (!configured) {
    // Demo: previsualiza el panel premium completo sin Supabase.
    richLife = buildDemoRichLifeSummary();
    wealth = buildDemoWealthSummary();
  }
  const panel = buildPanel({ ind: summary.indicators, currency, control, richLife, wealth });

  return { name, currency, summary, health, insights, panel, configured };
}

function demoIncome(name: string, type: IncomeSource["incomeType"], m: number): IncomeSource {
  return {
    id: name,
    name,
    incomeType: type,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    includeInBudget: true,
    amountMonthly: m,
  };
}
function demoExpense(name: string, nature: ExpenseItem["nature"], m: number): ExpenseItem {
  return {
    id: name,
    name,
    nature,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    amountMonthly: m,
  };
}

function buildDemoSummary(): BaseSummary {
  const incomes: IncomeSource[] = [
    demoIncome("Salario", "activo", 850_000),
    demoIncome("Alquiler apartamento", "pasivo", 250_000),
  ];
  const expenses: ExpenseItem[] = [
    demoExpense("Vivienda", "esencial", 300_000),
    demoExpense("Alimentación", "esencial", 180_000),
    demoExpense("Tarjeta de crédito", "financiero", 140_000),
    demoExpense("Suscripciones", "estilo_vida", 35_000),
    demoExpense("Inversión mensual", "inversion", 120_000),
    demoExpense("Fondo de emergencia", "ahorro", 90_000),
    demoExpense("Seguro médico", "proteccion", 60_000),
  ];
  return { indicators: computeBaseIndicators(incomes, expenses), incomes, expenses };
}
