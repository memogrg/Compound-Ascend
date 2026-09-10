import "server-only";
import { cache } from "react";

/**
 * Servicio de datos del Módulo 2 (respeta RLS). Arma los INDICADORES de la base
 * a partir del presupuesto vivo del periodo (`budget_items`), decide de qué mes
 * hablan (ver engine/periodo-indicadores) y expone las monedas de trabajo.
 */
import { cookies } from "next/headers";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { householdMemberIds } from "@/lib/household/active";
import {
  monthlyize,
  monthlyPlanned,
  mesesEntrePagos,
  type Frequency,
} from "@/modules/financial-base/engine/monthlyize";
import {
  computeBaseIndicators,
  naturalezaDeLinea,
} from "@/modules/financial-base/engine/base-engine";
import { userCurrentPeriod, userToday } from "@/lib/time/user-time";
import { ingresoPasivoDerivadoPromedio } from "@/modules/financial-base/services/derived-budget-service";
import { convertCurrency, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import {
  decidirPeriodoIndicadores,
  mesAnterior,
  type DecisionIndicadores,
} from "@/modules/financial-base/engine/periodo-indicadores";
import type {
  IncomeSource,
  ExpenseItem,
  BaseIndicators,
  IncomeType,
  OwnerScope,
} from "@/modules/financial-base/types";

/**
 * El CRUD de `income_sources` / `expense_items` vivía acá (listIncomes,
 * createIncome, updateExpense…). Se retiró con su UI (BaseDashboard/BaseActions,
 * y las server actions de api/actions.ts): los indicadores pasaron a leer el
 * presupuesto vivo de `budget_items` y esas tablas dejaron de tener pantalla
 * que las escribiera.
 *
 * Las TABLAS siguen existiendo a propósito: guardan filas históricas y
 * `dividend-service` / `rental-service` todavía borran por `income_id` al
 * revertir una renta o un dividendo. Lo que se fue es el código sin llamadores.
 */

export type BaseSummary = {
  indicators: BaseIndicators;
  incomes: IncomeSource[];
  expenses: ExpenseItem[];
  // Base Financiera V2 — campos AÑADIDOS (opcionales; no rompen consumidores).
  // Presupuesto y real del MES ACTUAL, normalizados a la moneda de visualización.
  budgetIncome?: number;
  realIncome?: number;
  budgetExpense?: number;
  realExpense?: number;
  variances?: { income: number; expense: number };
  /**
   * Monedas DISTINTAS que alimentaron estos indicadores (ítems de ingreso/gasto y, si el bloque V2
   * corrió, las transacciones del mes). Ordenadas, sin duplicados. Los totales de arriba están
   * CONVERTIDOS a la moneda de visualización: esto dice de dónde vienen. Una sola moneda igual a
   * esa = no hubo conversión. Lo consume el contexto del asesor para decir "convertido" en vez de
   * presentar el agregado como una cifra nativa.
   */
  monedasVistas: string[];
  /**
   * De QUÉ mes hablan `indicators`, y con qué etiqueta. Viaja con el dato para
   * que ninguna superficie —UI o asesor— pueda afirmar las cifras del mes
   * anterior como si fueran las de este. Ver `engine/periodo-indicadores`.
   */
  indicadoresDe: DecisionIndicadores;
};

/**
 * Ítems que alimentan los INDICADORES, construidos desde el presupuesto VIVO
 * del mes (`budget_items`) — que es lo que el usuario realmente edita.
 *
 * Antes salían de `income_sources` / `expense_items`, las tablas del Módulo 2
 * original. Ninguna pantalla las escribe ya (`createIncomeAction` y sus pares
 * quedaron sin un solo llamador cuando el tab de Ingresos pasó a budget_items),
 * así que para una cuenta real esas tablas están vacías o traen una fila
 * fósil. El efecto no era un número raro sino un diagnóstico entero inventado:
 * con gasto 0, la tasa de ahorro da 100 %, el peso de esenciales 0 % y el score
 * de salud sale 100 "SÓLIDA" — y de ahí comen el DTI de deudas, los pilares del
 * dashboard, los detectores de insights y el contexto del asesor. Es la misma
 * raíz que #638 parchó por el lado de Patrimonio ("un denominador, no cuatro
 * bugs"); esto la corta en el origen.
 *
 * Mapeo:
 *  · ingreso  → `monthlyPlanned` sobre el monto por pago (semántica única) y
 *               `income_type` como tipo.
 *  · gasto    → el monto de la línea YA es el presupuesto del mes; la
 *               naturaleza sale de `expense_categories.default_nature`.
 *
 * `includeInBudget` deja de existir como concepto: una línea de presupuesto
 * está en el presupuesto por definición. Se emite siempre true.
 */
async function baseItemsDelPeriodo(
  p: { year: number; month: number },
  ctx?: AuthContext,
): Promise<{
  incomes: IncomeSource[];
  expenses: ExpenseItem[];
  /** Ids de las líneas de ingreso derivadas de inversiones (renta/dividendo).
   *  Van por CALENDARIO, así que los indicadores las cambian por su promedio. */
  idsDerivadosInversion: Set<string>;
}> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);

  const [bi, cats] = await Promise.all([
    supabase
      .from("budget_items")
      .select("id,type,name,amount,currency,frequency,income_type,category_id,source_kind")
      .in("user_id", memberIds)
      .eq("period_month", p.month)
      .eq("period_year", p.year),
    supabase.from("expense_categories").select("id,default_nature,parent_id"),
  ]);

  const catsById = new Map((cats.data ?? []).map((c) => [c.id, c]));

  const incomes: IncomeSource[] = [];
  const expenses: ExpenseItem[] = [];
  const idsDerivadosInversion = new Set<string>();
  for (const r of bi.data ?? []) {
    const amount = Number(r.amount);
    const frequency = r.frequency as Frequency;
    if (r.type === "income") {
      if (r.source_kind === "rental" || r.source_kind === "dividend") {
        idsDerivadosInversion.add(r.id);
      }
      incomes.push({
        id: r.id,
        name: r.name,
        incomeType: (r.income_type ?? "activo") as IncomeType,
        category: null,
        amount,
        currency: r.currency,
        frequency,
        isFixed: true,
        certainty: null,
        ownerScope: "usuario" as OwnerScope,
        includeInBudget: true,
        amountMonthly: monthlyPlanned(amount, frequency),
      });
    } else {
      const cat = r.category_id ? catsById.get(r.category_id) : null;
      const padre = cat?.parent_id ? catsById.get(cat.parent_id) : null;
      expenses.push({
        id: r.id,
        name: r.name,
        categoryId: r.category_id,
        nature: naturalezaDeLinea({
          sourceKind: r.source_kind,
          categoryNature: cat?.default_nature ?? null,
          parentNature: padre?.default_nature ?? null,
        }),
        amount,
        currency: r.currency,
        frequency,
        isFixed: true,
        obligation: null,
        reducible: null,
        ownerScope: "usuario" as OwnerScope,
        // La línea del sobre ya ES el presupuesto de ese mes (ver getBudgetTotals).
        amountMonthly: amount,
      });
    }
  }
  return { incomes, expenses, idsDerivadosInversion };
}

/**
 * Provisión mensual para gastos que NO llegan todos los meses (`annualCoverage`).
 *
 * Salía de recorrer los ítems de gasto y quedarse con los de frecuencia
 * no-mensual. Con los indicadores leyendo el presupuesto vivo eso da 0 siempre:
 * una línea de `budget_items` ES el presupuesto de un mes, así que nace
 * "mensual" por construcción y la cadencia real se pierde. Dejarlo en 0 no era
 * neutral — apagaba en silencio el aviso del dashboard y el subtítulo del pilar.
 *
 * La cadencia sí vive en las ENTIDADES, que son las mismas de las que
 * `syncDerivedBudget` deriva sus líneas: pólizas (`premium_frequency`) y
 * plantillas recurrentes de gasto. Se mensualiza cada compromiso no-mensual y se
 * suma — que es exactamente lo que hay que apartar cada mes para que la prima
 * semestral o el marchamo anual no lleguen de sorpresa.
 */
async function provisionNoMensual(
  primary: string,
  rates: Record<string, number>,
  ctx?: AuthContext,
): Promise<number> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);

  const [pol, rec] = await Promise.all([
    supabase
      .from("insurance_policies")
      .select("premium,premium_frequency,currency")
      .in("user_id", memberIds),
    supabase
      .from("recurring_items")
      .select("amount,frequency,currency")
      .in("user_id", memberIds)
      .eq("kind", "gasto")
      .eq("active", true),
  ]);

  let total = 0;
  const sumar = (amount: number, frequency: string | null, currency: string | null) => {
    const f = (frequency ?? "mensual") as Frequency;
    // Sólo los multi-mes necesitan provisión: lo mensual y lo sub-mensual ya
    // caen dentro del mes y están en el presupuesto.
    if (mesesEntrePagos(f) <= 1) return;
    total += convertCurrency(monthlyize(amount, f), currency ?? primary, primary, rates);
  };

  for (const p of pol.data ?? []) sumar(Number(p.premium ?? 0), p.premium_frequency, p.currency);
  for (const r of rec.data ?? []) sumar(Number(r.amount ?? 0), r.frequency, r.currency);

  return Math.round(total * 100) / 100;
}

/**
 * ¿De qué mes hablan los indicadores? Ver `engine/periodo-indicadores`.
 *
 * Las dos señales que necesita el motor salen de acá: si el mes en curso tiene
 * al menos un sobre MANUAL con monto, y si la ventana de ajuste sigue abierta.
 */
async function decidirPeriodo(
  actual: { year: number; month: number },
  ctx?: AuthContext,
): Promise<DecisionIndicadores> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);

  // Sólo las MANUALES cuentan como "el usuario ya configuró el mes": las
  // derivadas se regeneran solas y harían que la condición fuese siempre cierta.
  const { count } = await supabase
    .from("budget_items")
    .select("id", { count: "exact", head: true })
    .in("user_id", memberIds)
    .eq("type", "expense")
    .eq("period_year", actual.year)
    .eq("period_month", actual.month)
    .eq("source_kind", "manual")
    .gt("amount", 0);

  const hoy = await userToday(ctx);
  const dia = Number(hoy.slice(8, 10));
  const { estadoVentana } = await import("@/lib/rhythm/engine");
  // `closed_at` es un cierre explícito del hogar; acá alcanza con el día, porque
  // cerrar la ventana a mano sólo puede ADELANTAR la salida del fallback.
  const ventana = estadoVentana({ dia, closedAt: null });

  const previo = mesAnterior(actual);
  const { count: previoCount } = await supabase
    .from("budget_items")
    .select("id", { count: "exact", head: true })
    .in("user_id", memberIds)
    .eq("period_year", previo.year)
    .eq("period_month", previo.month);

  return decidirPeriodoIndicadores({
    actual,
    tienePresupuestoDeGasto: (count ?? 0) > 0,
    ventanaAbierta: ventana.abierta,
    hayMesCerrado: (previoCount ?? 0) > 0,
  });
}

/** Carga ítems y calcula los indicadores de la base financiera. */
async function _getBaseSummary(ctx?: AuthContext): Promise<BaseSummary> {
  const actual = await userCurrentPeriod(ctx);
  const decision = await decidirPeriodo(actual, ctx);
  const [{ incomes, expenses, idsDerivadosInversion }, primary, rates, promediosDerivados] =
    await Promise.all([
      baseItemsDelPeriodo(decision.periodo, ctx),
      getDisplayCurrency(ctx),
      getFxRates(),
      ingresoPasivoDerivadoPromedio(ctx),
    ]);
  // Los indicadores agregan dinero, así que normalizamos cada ítem a la moneda
  // de visualización antes de sumar. Los montos por ítem se conservan en su moneda
  // original (los componentes los muestran tal cual el usuario los registró).
  // Las líneas derivadas de inversiones se escriben por CALENDARIO (el pago
  // completo, sólo en sus meses). Para los INDICADORES se cambian por su promedio
  // mensual: si no, un cupón trimestral haría que la tasa de ahorro y el score de
  // salud saltaran un mes de cada tres y no describieran nada. Es el corte de #740
  // —`monthlyPlanned` para el flujo del mes, `monthlyize` para los indicadores—
  // aplicado al rendimiento de las inversiones.
  //
  // `incomes` sale intacto: las pantallas del presupuesto siguen mostrando el mes.
  const incForEngine: IncomeSource[] = incomes
    .filter((i) => !idsDerivadosInversion.has(i.id))
    .map((i) => ({
      ...i,
      amountMonthly: convertCurrency(i.amountMonthly, i.currency, primary, rates),
    }));
  for (const d of promediosDerivados) {
    incForEngine.push({
      id: `derivado-${d.sourceId}`,
      name: "Rendimiento de inversiones",
      // Es ingreso pasivo por definición: lo produce un activo, no el trabajo.
      incomeType: "pasivo",
      category: null,
      amount: d.monthly,
      currency: d.currency,
      frequency: "mensual" as Frequency,
      isFixed: true,
      certainty: null,
      ownerScope: "usuario" as OwnerScope,
      includeInBudget: true,
      amountMonthly: convertCurrency(d.monthly, d.currency, primary, rates),
    });
  }
  const expForEngine = expenses.map((e) => ({
    ...e,
    amountMonthly: convertCurrency(e.amountMonthly, e.currency, primary, rates),
  }));

  // Monedas de origen de los ítems que alimentan los indicadores (antes de convertir).
  const monedas = new Set<string>();
  for (const i of incomes) if (i.currency) monedas.add(i.currency);
  for (const e of expenses) if (e.currency) monedas.add(e.currency);

  const summary: BaseSummary = {
    indicators: computeBaseIndicators(incForEngine, expForEngine),
    incomes,
    expenses,
    monedasVistas: [...monedas].sort(),
    indicadoresDe: decision,
  };

  // `annualCoverage` no se puede derivar de las líneas del presupuesto (nacen
  // mensuales); se reconstruye desde las entidades que sí llevan la cadencia.
  // Best-effort: si falla, queda el 0 del motor y el resto de los indicadores
  // no se ve afectado.
  try {
    summary.indicators.annualCoverage = await provisionNoMensual(primary, rates, ctx);
  } catch {
    // sin pólizas/recurrentes accesibles: se queda en 0.
  }

  // V2 (best-effort, no bloquea ni rompe a los 5 consumidores si falla).
  try {
    const v2 = await computeV2Totals(primary, rates, ctx);
    Object.assign(summary, v2);
    // Las monedas de las transacciones del mes también entraron en realIncome/realExpense.
    summary.monedasVistas = [...new Set([...summary.monedasVistas, ...v2.monedasVistas])].sort();
  } catch {
    // Sin presupuesto/transacciones aún: los campos V2 quedan undefined.
  }

  return summary;
}

/** Presupuesto-vs-real del mes actual (campos V2 de getBaseSummary). */
async function computeV2Totals(
  displayCurrency: string,
  rates: Record<string, number>,
  ctx?: AuthContext,
): Promise<
  Pick<
    BaseSummary,
    "budgetIncome" | "realIncome" | "budgetExpense" | "realExpense" | "variances" | "monedasVistas"
  >
> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);
  const p = await userCurrentPeriod(ctx);

  const [bi, tx] = await Promise.all([
    supabase
      .from("budget_items")
      .select("type,amount,currency,frequency")
      .in("user_id", memberIds)
      .eq("period_month", p.month)
      .eq("period_year", p.year),
    supabase
      .from("transactions")
      .select("kind,amount,currency,counts_in_budget")
      .in("user_id", memberIds)
      .gte("occurred_on", p.from)
      .lte("occurred_on", p.to),
  ]);

  let budgetIncome = 0;
  let budgetExpense = 0;
  let realIncome = 0;
  let realExpense = 0;
  // Misma pasada que ya recorre presupuesto y transacciones: sin query ni loop extra.
  const monedas = new Set<string>();
  for (const r of bi.data ?? []) {
    // Mismo criterio que getBudgetTotals: el monto de una fuente de ingreso es lo
    // que llega POR PAGO, así que su aporte al mes pasa por `monthlyPlanned`. El
    // gasto no: la línea del sobre ya es el presupuesto de ese mes.
    const nativo =
      r.type === "income"
        ? monthlyPlanned(Number(r.amount), r.frequency as Frequency)
        : Number(r.amount);
    const v = convertCurrency(nativo, r.currency, displayCurrency, rates);
    if (r.currency) monedas.add(r.currency);
    if (r.type === "income") budgetIncome += v;
    else budgetExpense += v;
  }
  for (const r of tx.data ?? []) {
    const v = convertCurrency(Number(r.amount), r.currency, displayCurrency, rates);
    if (r.currency) monedas.add(r.currency);
    if (r.kind === "ingreso") realIncome += v;
    // Off-budget (consumo de frasco): fuera del gasto real en la varianza presup-vs-real.
    else if (r.counts_in_budget !== false) realExpense += v;
  }

  return {
    budgetIncome,
    realIncome,
    budgetExpense,
    realExpense,
    monedasVistas: [...monedas].sort(),
    variances: {
      income: budgetIncome > 0 ? (realIncome - budgetIncome) / budgetIncome : 0,
      expense: budgetExpense > 0 ? (realExpense - budgetExpense) / budgetExpense : 0,
    },
  };
}

/** Moneda principal del usuario (de user_settings); CRC por defecto.
 *  Es la moneda por defecto al registrar ítems nuevos. */
async function _getPrimaryCurrency(ctx?: AuthContext): Promise<string> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db
    .from("user_settings")
    .select("primary_currency")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.primary_currency ?? "CRC";
}

/** Cookie que guarda la moneda de visualización (switch rápido en dashboards). */
export const DISPLAY_CURRENCY_COOKIE = "ca_display_currency";

/**
 * Moneda de visualización de los dashboards: si hay override por cookie (el
 * switch rápido), se usa esa; si no, la moneda principal. Solo afecta cómo se
 * MUESTRAN los totales — los datos se registran en la moneda que el usuario
 * elija y la app los convierte a esta para mostrarlos.
 */
async function _getDisplayCurrency(ctx?: AuthContext): Promise<string> {
  // Sin sesión (cron): no hay cookie de override → se usa la moneda primaria.
  if (ctx) return getPrimaryCurrency(ctx);
  // El switch rápido vive en la cookie del request. `cookies()` lanza FUERA de un
  // request scope (headless/test bajo la ALS); ahí no hay override que aplicar → se
  // cae a la moneda primaria (misma rama default que con ctx; getPrimaryCurrency ya
  // resuelve headless por la ALS, sin `cookies()` crudo). En prod SIEMPRE hay request
  // scope → override aplicado como siempre → byte-idéntico.
  try {
    const store = await cookies();
    const override = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
    if (override && (SUPPORTED_CURRENCIES as readonly string[]).includes(override)) {
      return override;
    }
  } catch {
    // Sin request scope: sin cookie de override → moneda primaria.
  }
  return getPrimaryCurrency();
}

/** Dedup por request (React cache): se llamaba getBaseSummary varias veces por render. */
export const getBaseSummary = cache(_getBaseSummary);

/** Dedup por request (React cache): se llamaba getPrimaryCurrency varias veces por render. */
export const getPrimaryCurrency = cache(_getPrimaryCurrency);

/** Dedup por request (React cache): se llamaba getDisplayCurrency varias veces por render. */
export const getDisplayCurrency = cache(_getDisplayCurrency);
