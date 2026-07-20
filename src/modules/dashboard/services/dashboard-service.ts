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

/** Qué resúmenes best-effort NO llegaron (fallo o techo de tiempo). Lo consume la UI
 *  para no confundir "esta vez no cargó" con "no tienes nada registrado". */
export type Degradado = { control: boolean; richLife: boolean; wealth: boolean };

export type DashboardData = {
  name: string;
  currency: string;
  summary: BaseSummary;
  health: HealthScore;
  insights: DashboardInsights;
  panel: PanelVM;
  configured: boolean;
  degradado: Degradado;
};

/** Techo de tiempo para los resúmenes best-effort del panel (ms). Corto a propósito:
 *  son consultas a BD, y si una tarda más que esto ya arruinó el arranque. */
const LIMITE_RESUMEN_MS = 1000;

/** Resultado de un resumen best-effort: el valor, y si hubo que degradar.
 *  `degradado` distingue "no cargó" de "no hay nada registrado", que son cosas
 *  distintas y la UI las contaba como la misma. */
type Intento<T> = { valor: T | null; degradado: boolean };

/**
 * Presupuesto de tiempo DURO. El `.catch` que había antes acotaba los ERRORES pero no
 * la LENTITUD: una cadena de proveedores lenta pero exitosa bloqueaba igual, porque
 * nadie la interrumpía. Esto pone el techo.
 *
 * No cancela el trabajo de fondo (una promesa no se puede abortar): simplemente deja de
 * esperarlo y el panel degrada, exactamente igual que cuando la pieza falla. Pero ahora
 * lo REPORTA: sin ese dato, una pantalla que no cargó y un usuario sin datos se veían
 * igual, y a alguien con ₡278,9 M registrados se le decía "registra tu patrimonio".
 */
function conLimite<T>(p: Promise<T>): Promise<Intento<T>> {
  return Promise.race([
    p.then((valor) => ({ valor, degradado: false })).catch(() => ({ valor: null, degradado: true })),
    new Promise<Intento<T>>((resolver) => {
      const t = setTimeout(() => resolver({ valor: null, degradado: true }), LIMITE_RESUMEN_MS);
      // No mantiene vivo el proceso si todo lo demás ya terminó (cron, scripts).
      (t as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

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
  const degradado: Degradado = { control: false, richLife: false, wealth: false };
  if (configured && user) {
    const [c, r, w] = await Promise.all([
      conLimite(getControlSummary()),
      // Precios desde la caché persistida: esta pantalla es un RESUMEN, y esperar a un
      // proveedor externo cuesta más de lo que vale la frescura. Patrimonio y Portafolio
      // siguen en vivo, y son ellos quienes mantienen la caché al día.
      conLimite(getRichLifeSummary({ precios: "cache" })),
      conLimite(getWealthSummary()),
    ]);
    control = c.valor;
    richLife = r.valor;
    wealth = w.valor;
    degradado.control = c.degradado;
    degradado.richLife = r.degradado;
    degradado.wealth = w.degradado;
  } else if (!configured) {
    // Demo: previsualiza el panel premium completo sin Supabase.
    richLife = buildDemoRichLifeSummary();
    wealth = buildDemoWealthSummary();
  }
  const panel = buildPanel({ ind: summary.indicators, currency, control, richLife, wealth });

  return { name, currency, summary, health, insights, panel, configured, degradado };
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
