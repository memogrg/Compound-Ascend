import "server-only";

/**
 * Motor de contexto financiero para la IA (Fase 5 · interconexión).
 *
 * Extraído de app/api/assistant/chat/route.ts y enriquecido: además de los
 * indicadores de Base Financiera y el portafolio, ahora incluye perfil
 * (preocupación principal, etapa de vida), deudas activas, metas con avance,
 * patrimonio neto y las entidades vinculables (para que la IA pueda PROPONER
 * transacciones ya vinculadas — nunca ejecutarlas).
 *
 * Cada bloque es best-effort: si una fuente falla, el contexto sigue siendo
 * útil con lo que haya. Todas las lecturas respetan RLS (cliente de sesión).
 */
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { applyRankedProfile } from "@/lib/ai/profile-ranking";
import { householdMemberIds } from "@/lib/household/active";
import type { FinancialContext } from "@/lib/ai/orchestrator";
import { convertCurrency } from "@/lib/fx";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";

/**
 * PRIVACIDAD (cuenta compartida): las lecturas FINANCIERAS de este motor abarcan
 * a todo el hogar, así que un miembro puede consultar por IA los movimientos,
 * metas y deudas del otro. Es la intención de la cuenta en común — la plata es
 * compartida. El PERFIL (riesgo/comportamiento/conocimiento/preferencias/
 * prioridades) sigue por user_id: la IA aconseja sobre la plata común según a
 * QUIÉN le habla, sin mezclar perfiles en una "persona promedio" que no existe.
 */

/** Coacciona un valor jsonb a string[] (las columnas jsonb llegan como unknown). */
function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Alcance del contexto: qué bloques CAROS construir. Los bloques baratos (base, perfil, deudas,
 * metas, sobres) SIEMPRE corren (definen currency/rates y son lecturas rápidas). Los caros se gatean
 * para el CONTEXTO PEREZOSO: una consulta que el router resuelve determinista no debe pagar el
 * portafolio (precios de mercado en vivo — el costo dominante) ni el patrimonio ni los bloques
 * "flavor" (solo para el LLM). Default = todo (backward-compat: WhatsApp y el fallback LLM no cambian).
 */
export type ContextScope = {
  patrimonio?: boolean; // getPatrimonioReport: números, compromiso*, mesesDeColchon, investableWealth
  portfolio?: boolean; // getPortfolioReport: holdings, investment* (precios en vivo — CARO)
  defense?: boolean; // getDefenseFundsReport: defenseFunds
  flavor?: boolean; // richlife, trayectoria, perfil conductual, vinculables, insights, macro (solo LLM)
};
export const FULL_CONTEXT_SCOPE: ContextScope = { patrimonio: true, portfolio: true, defense: true, flavor: true };

/** Tope de porciones de concentración listadas en el prompt (el HHI y los % son sobre todas). */
const MAX_CONCENTRATION_SLICES = 8;

export async function buildFinancialContext(scope: ContextScope = FULL_CONTEXT_SCOPE): Promise<FinancialContext> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? undefined;
  if (!isSupabaseConfigured() || !user) return { name, currency: "CRC" };

  let ctx: FinancialContext = { name, currency: "CRC" };
  // El chat usa la moneda de VISUALIZACIÓN del usuario (la que ve en toda la app; cookie
  // ca_display_currency, con fallback a la principal cuando no hay sesión — p. ej. WhatsApp/cron). TODO
  // el contexto queda en ESA moneda: los servicios que devuelven en la principal se convierten con
  // `rates` a `ctx.currency`. Así el asesor nunca mezcla "ingreso ₡X" con "te quedan $Y".
  let rates: Record<string, number> | undefined;
  let primaryCurrency: string | undefined; // para convertir lo que un servicio devuelve en la principal

  // ¿Hogar compartido? (más de un miembro) → la IA trata las cifras como comunes.
  // Best-effort: si falla, el chat no se degrada, solo no marca lo compartido.
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const members = await householdMemberIds(supabase, user.id);
    if (members.length > 1) ctx.householdShared = true;
  } catch {
    // Sin dato de hogar: se asume individual.
  }

  // Base Financiera: indicadores del mes, EN LA MONEDA DE VISUALIZACIÓN. Sin AuthContext explícito,
  // getBaseSummary usa getDisplayCurrency() (cookie) internamente → los indicadores llegan en display.
  // También leemos la principal para convertir después lo que otros servicios devuelvan en principal.
  try {
    const { getBaseSummary, getPrimaryCurrency, getDisplayCurrency } = await import(
      "@/modules/financial-base/services/base-service"
    );
    const { getFxRates } = await import("@/lib/market-data/fx-rates");
    const [base, display, primary, fx] = await Promise.all([
      getBaseSummary(),
      getDisplayCurrency(),
      getPrimaryCurrency(),
      getFxRates().catch(() => ({}) as Record<string, number>),
    ]);
    rates = fx;
    primaryCurrency = primary;
    ctx = {
      ...ctx,
      currency: display,
      incomeMonthly: base.indicators.incomeMonthly,
      expenseMonthly: base.indicators.expenseMonthly,
      freeCashflow: base.indicators.freeCashflow,
    };
    // Gasto más pesado por naturaleza (ya en la moneda de visualización) + tasa de ahorro.
    const natureEntries = Object.entries(base.indicators.expenseByNature).filter(([, v]) => v > 0);
    if (natureEntries.length > 0 && base.indicators.expenseMonthly > 0) {
      const top = natureEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
      ctx.topExpenseCategory = {
        name: top[0].replaceAll("_", " "),
        monthly: Math.round(top[1]),
        pct: Math.round((top[1] / base.indicators.expenseMonthly) * 100),
      };
    }
    ctx.savingsRatePct = Math.round(base.indicators.savingsRate * 100);
    // Fuentes de ingreso activas (para señalar concentración si es una sola).
    ctx.incomeSourceCount = base.incomes.filter((i) => i.amountMonthly > 0).length;
    // ¿Ingreso/gasto/flujo son cifras CONVERTIDAS? Sí si hubo más de una moneda de origen, o si la
    // única no es la de visualización. Sin el dato → undefined (no se asume nada).
    const vistas = base.monedasVistas;
    if (vistas && vistas.length > 0) {
      ctx.baseConvertido = vistas.length > 1 || vistas[0] !== display;
    }
  } catch {
    // Sin base: contexto mínimo.
  }

  // Convierte un monto que un servicio devolvió en la moneda PRINCIPAL a la de VISUALIZACIÓN
  // (ctx.currency). Usado por portfolio/defensa, que leen en principal. Sin rates → deja el monto igual.
  const toDisplay = (n: number): number =>
    primaryCurrency && primaryCurrency !== ctx.currency && rates
      ? Math.round(convertCurrency(n, primaryCurrency, ctx.currency, rates))
      : Math.round(n);

  // Perfil: preocupación principal, etapa de vida y arquetipo conductual (Fase 2).
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data: pp } = await supabase
      .from("personal_profiles")
      .select(
        "main_concern,life_stage,archetype_primary,archetype_secondary,dominant_emotion,ai_tone_recommended,money_script",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (pp?.main_concern) ctx.topConcern = String(pp.main_concern).replaceAll("_", " ");
    if (pp?.life_stage) ctx.lifeStage = String(pp.life_stage).replaceAll("_", " ");
    if (pp?.money_script) ctx.moneyScript = pp.money_script;
    if (pp?.archetype_primary) {
      const { ARCHETYPE_PLAYBOOKS } = await import("@/lib/ai/advisor-knowledge");
      const primary = pp.archetype_primary as keyof typeof ARCHETYPE_PLAYBOOKS;
      const play = ARCHETYPE_PLAYBOOKS[primary];
      if (play) {
        ctx.archetypePrimary = primary;
        ctx.archetypeLabel = play.label;
        ctx.archetypeGuidance = play.guidance;
        ctx.initialFocus = play.initialFocus;
        // Preferir el tono persistido en el perfil; si no, el del playbook.
        ctx.recommendedTone = pp.ai_tone_recommended ?? play.recommendedTone;
      }
      if (pp.archetype_secondary) {
        const secondary = pp.archetype_secondary as keyof typeof ARCHETYPE_PLAYBOOKS;
        const play2 = ARCHETYPE_PLAYBOOKS[secondary];
        if (play2) {
          ctx.archetypeSecondary = secondary;
          ctx.archetypeLabel2 = play2.label;
        }
      }
    }
    if (pp?.dominant_emotion) ctx.dominantEmotion = pp.dominant_emotion;
  } catch {
    // Perfil no disponible.
  }

  // Deudas activas: total POR MONEDA, cuántas y la más cara. Cada deuda tiene su propia moneda
  // (Debt.currency): sumar los saldos crudos daba un número que no existe — una tarjeta de $2.000
  // más un préstamo de ₡3.000.000 salían como "3.002.000". Ahora son subtotales, más el total
  // convertido SOLO si hay tasas para todas las monedas.
  try {
    const { listDebts } = await import("@/modules/control/services/control-service");
    const { subtotales, convertirTotal } = await import("@/lib/ai/money");
    const debts = (await listDebts()).filter((d) => d.balance > 0);
    if (debts.length > 0) {
      ctx.debtCount = debts.length;
      ctx.debtTotals = subtotales(debts.map((d) => ({ monto: Math.round(d.balance), moneda: d.currency })));
      const convertido = convertirTotal(ctx.debtTotals, ctx.currency, rates);
      if (convertido) ctx.debtTotalConvertido = convertido;
      const top = debts.reduce((a, b) => ((a.apr ?? 0) >= (b.apr ?? 0) ? a : b));
      ctx.topDebtName = top.name;
      ctx.topDebtApr = top.apr ?? undefined;
      ctx.topDebtCurrency = top.currency;
    }
  } catch {
    // Control no disponible.
  }

  // Metas: cuántas y avance agregado.
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    // Financiero → alcance de hogar: las metas de la cuenta común son de todos.
    const memberIds = await householdMemberIds(supabase, user.id);
    const { data: goals } = await supabase
      .from("savings_goals")
      .select("current_amount,target_amount")
      .in("user_id", memberIds);
    if (goals && goals.length > 0) {
      const target = goals.reduce((s, g) => s + Number(g.target_amount), 0);
      const current = goals.reduce((s, g) => s + Number(g.current_amount), 0);
      ctx.goalCount = goals.length;
      if (target > 0) ctx.goalsProgressPct = current / target;
    }
  } catch {
    // Metas no disponibles.
  }

  // Sobres (bug: la IA no los veía y alucinaba "todas al 100%"). Sobres de GASTO
  // (hojas favoritas por frasco, con presupuesto) + sobres ACUMULABLES (metas por frasco),
  // con alcance de hogar y moneda de visualización. Best-effort.
  try {
    const { getEnvelopesSummary } = await import("@/modules/financial-base");
    const summary = await getEnvelopesSummary();
    if (summary.expense.length > 0 || summary.goals.length > 0) {
      // getEnvelopesSummary viene en moneda de DISPLAY y el AI también trabaja en DISPLAY
      // (ctx.currency, desde #560): el helper puro reetiqueta y, si difieren, CONVIERTE.
      // Convertir acá es INTENCIONAL, no una omisión del trabajo de moneda nativa: un sobre es una
      // olla contra la que se gasta, y su razón de ser es un solo número. "Restaurantes: ₡80.000 +
      // $50" no es más honesto que el total convertido — es menos usable y rompe la mecánica de
      // sobres. Lo que sí importa es DECIRLO: el prompt aclara que los presupuestos vienen
      // convertidos (ver la línea de sobres en system-prompt.ts).
      const { normalizeEnvelopes } = await import("@/lib/ai/envelopes-currency");
      const norm = normalizeEnvelopes(summary, ctx.currency, rates ?? {});
      ctx.envelopes = norm.envelopes;
      if (norm.topGastoSobre) ctx.topGastoSobre = norm.topGastoSobre;
    }
  } catch {
    // Sobres no disponibles: el contexto sigue.
  }

  // Patrimonio neto (Rich Life) — best-effort. Bloque "flavor" (solo lo usa el system prompt del LLM).
  if (scope.flavor) try {
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const summary = await getRichLifeSummary();
    ctx.netWorth = Math.round(summary.snapshot.indicators.netWorth);
    // Respaldo REAL (meses de independencia): señal dura para el guardrail R3 (fondo de paz).
    ctx.emergencyMonths = Math.round(summary.snapshot.indicators.monthsOfIndependence);
    // Desglose invertido/líquido/otros sobre el MISMO set agregado (paridad con WhatsApp).
    ctx.wealthBreakdown = computeWealthBreakdown(summary.allAssets);
  } catch {
    // Rich Life no disponible.
  }

  // Portafolio: agregados + DETALLE POR POSICIÓN (para que el asesor vea las inversiones y
  // responda con cifras reales, p. ej. ganancia al vender). Todo del motor de analytics
  // (holdingsWithPerformance), en moneda principal, scope de hogar. Best-effort.
  if (scope.portfolio) try {
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const report = await getPortfolioReport();
    const a = report.analytics;
    // Moneda en la que el motor entrega: la PRINCIPAL. Si no se pudo leer, se asume la de
    // visualización (es lo que toDisplay hacía de hecho al no tener con qué convertir).
    const monedaPrimaria = primaryCurrency ?? ctx.currency;
    const { mapHoldingsForContext } = await import("@/lib/ai/holdings-context");
    const { subtotales, convertirTotal } = await import("@/lib/ai/money");
    // Conversor real primaria → moneda de la fila. Sin tasas devuelve null y la fila se queda en
    // primaria BIEN etiquetada (nunca un monto sin convertir con la etiqueta de otra moneda).
    const convertir = (monto: number, desde: string, hacia: string): number | null => {
      if (desde === hacia) return monto;
      if (!rates || !rates[desde] || !rates[hacia]) return null;
      const out = convertCurrency(monto, desde, hacia, rates);
      return Number.isFinite(out) ? out : null;
    };

    if (a.totalPortfolioValue > 0) {
      const topSlice = Object.values(a.allocation).reduce((x, y) => (x.value > y.value ? x : y));
      ctx.portfolioReturnPct = a.totalReturnPct; // % no se convierte
      ctx.topAssetClass = topSlice.label;
      // CONCENTRACIÓN CANÓNICA: la del motor, sobre TODAS las posiciones y en la moneda del motor
      // (los % no se convierten; los montos van etiquetados con esa base). El informe la CONSUME,
      // no la recalcula — una sola definición en el repo. Va como hecho, no como tool.
      const { concentrations } = await import("@/modules/wealth/engine/portfolio-engine");
      const conc = concentrations(a.holdingsWithPerformance ?? []);
      const slice = (s: { label: string; value: number; pct: number }) => ({
        label: s.label,
        valor: Math.round(s.value),
        pct: s.pct,
      });
      // El detalle por posición se acota (como mapHoldingsForContext) para no inflar el prompt; el
      // HHI y los porcentajes se calculan sobre TODAS, así que no pierden nada.
      const todas = conc.byAsset;
      const listadas = todas.slice(0, MAX_CONCENTRATION_SLICES);
      ctx.concentracion = {
        moneda: monedaPrimaria,
        porPosicion: listadas.map(slice),
        porMoneda: conc.byCurrency.map(slice),
        porRegion: conc.byRegion.map(slice),
        porTipo: Object.values(a.allocation).filter((s) => s.value > 0).map(slice),
        top1Pct: todas[0]?.pct ?? 0,
        top3Pct: todas.slice(0, 3).reduce((acc, s) => acc + s.pct, 0),
        hhi: todas.reduce((acc, s) => acc + s.pct ** 2, 0),
        slicesOmitidas: Math.max(0, todas.length - listadas.length),
      };
      if (typeof a.growthScore === "number") ctx.growthScore = a.growthScore;
    }
    // Detalle por posición (COMPACTO: top-N por valor, resto en holdingsMoreCount). Mapeo PURO: cada
    // fila queda en la moneda en que ese activo COTIZA (USD los cotizados), no aplanada a display.
    const mapped = mapHoldingsForContext(
      a.holdingsWithPerformance ?? [],
      a.totalCostBasis,
      a.totalProfitLoss,
      { monedaPrimaria, convertir },
    );
    if (mapped) {
      ctx.holdings = mapped.holdings;
      ctx.holdingsMoreCount = mapped.holdingsMoreCount;
      ctx.investmentInvested = mapped.investmentInvested;
      ctx.investmentValue = mapped.investmentValue;
      ctx.investmentPL = mapped.investmentPL;
      ctx.investmentValueBase = mapped.totalPrimario.valor;
      // Valor del portafolio: subtotales por moneda + el total convertido a la de visualización,
      // que solo existe si hay tasas para todas las monedas involucradas (si no, undefined).
      ctx.portfolioValue = subtotales(mapped.investmentValue);
      const convertido = convertirTotal(mapped.investmentValue, ctx.currency, rates);
      if (convertido) ctx.portfolioValueConvertido = convertido;
    }
  } catch {
    // Portafolio no disponible.
  }

  // Trayectoria (memoria longitudinal): tendencias mes a mes vía el motor puro. Best-effort;
  // si hay <3 meses de historia el motor devuelve undefined (no inventamos tendencias).
  if (scope.flavor) try {
    const { getSnapshotHistory } = await import(
      "@/modules/financial-base/services/snapshot-service"
    );
    const { computeTrajectory } = await import("@/lib/ai/trajectory");
    const monthly = (await getSnapshotHistory(6)).map((h) => ({
      period: h.period,
      income: h.realIncome,
      expense: h.realExpense,
      freeCashflow: h.freeCashflow,
    }));
    let portfolio: { date: string; portfolioValue: number; netWorth: number }[] = [];
    try {
      const { getSnapshotHistory: getPortfolioHistory } = await import(
        "@/modules/wealth/services/snapshot-service"
      );
      portfolio = (await getPortfolioHistory("6M")).map((p) => ({
        date: p.date,
        portfolioValue: p.portfolioValue,
        netWorth: p.netWorth,
      }));
    } catch {
      // Sin historia de portafolio: la trayectoria usa solo lo mensual.
    }
    ctx.trajectory = computeTrajectory(monthly, portfolio);
  } catch {
    // Trayectoria no disponible (usuario nuevo o sin snapshots).
  }

  // Marco Patrimonial (motor patrimonio-engine) — best-effort: consume el reporte
  // tal cual, sin recalcular. Si falla, el chat sigue sin estas métricas.
  if (scope.patrimonio) try {
    const { getPatrimonioReport } = await import("@/modules/wealth");
    const p = await getPatrimonioReport();
    // El reporte viene en SU moneda (p.currency, la de display); el AI usa ctx.currency (principal).
    // Convertimos CADA monto acá (con rates) para que todo llegue en ctx.currency y CUADRE
    // (compromiso ≈ Independencia×0,08÷12, ambos convertidos por el mismo factor). El LLM no convierte.
    const pconv = (n: number): number =>
      p.currency && p.currency !== ctx.currency && rates
        ? Math.round(convertCurrency(n, p.currency, ctx.currency, rates))
        : Math.round(n);
    ctx.indicePatrimonial = Math.round(p.report.indice);
    ctx.nivelPatrimonial = p.level.name;
    // Los TRES números (al 8%): Seguridad (esencial), Independencia (total actual, siempre
    // presente) y Libertad (deseado, nullable — se maneja abajo). No se mezclan.
    ctx.numeroDeSeguridad = pconv(p.report.numeroDeSeguridad);
    ctx.numeroDeIndependencia = pconv(p.report.numeroDeIndependencia);
    // Compromiso mensual TOTAL (base de la Independencia) + desglose: para que el asesor reporte el
    // número REAL y sepa que ya incluye sobres+metas+DCA (no pedir "registrá tu gasto" si ya está).
    if (p.commitmentBreakdown && p.commitmentBreakdown.total > 0) {
      const b = p.commitmentBreakdown;
      ctx.compromisoMensual = pconv(b.total);
      ctx.compromisoDesglose = {
        sobres: pconv(b.byOrigin.sobres),
        metas: pconv(b.byOrigin.goals),
        dca: pconv(b.byOrigin.dca),
        deudas: pconv(b.byOrigin.debts),
        seguros: pconv(b.byOrigin.policies),
      };
    }
    // "Número de libertad" (estilo deseado): solo si el usuario lo definió; si es
    // null se OMITE (nada de fallback silencioso).
    if (p.report.numeroDeLibertad != null) {
      ctx.numeroDeLibertad = pconv(p.report.numeroDeLibertad);
    }
    ctx.añosDeLibertad = Math.round(p.report.añosDeLibertad);
    ctx.mesesDeColchon = Math.round(p.report.mesesDeColchon); // ratio (meses), no es monto
    ctx.coberturaPasivaPct = Math.round(p.report.coberturaPasiva * 100); // %
    ctx.calidadPatrimonio = Math.round(p.report.calidadPatrimonio); // score 0-100
    ctx.investableWealth = pconv(p.report.investableWealth); // monto → convertir
    ctx.patrimonioDiagnosis = p.diagnosis.map((d) => d.code);
  } catch {
    // Marco Patrimonial no disponible.
  }

  // Perfil conductual (Fase · asesor conductual). Bloque "flavor" (tono/coaching para el LLM).
  // Lectura best-effort con el cliente de sesión (respeta RLS); cada tabla en su try/catch.
  if (scope.flavor) try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();

    // Perfil de riesgo.
    try {
      const { data } = await supabase
        .from("risk_profiles")
        .select("risk_class,loss_reaction,preference,horizon,volatility_comfort,has_invested")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        if (data.risk_class) ctx.riskClass = data.risk_class;
        if (data.loss_reaction) ctx.lossReaction = data.loss_reaction;
        if (data.preference) ctx.riskPreference = data.preference;
        if (data.horizon) ctx.horizon = data.horizon;
        if (data.volatility_comfort != null) ctx.volatilityComfort = data.volatility_comfort;
        if (data.has_invested != null) ctx.hasInvested = data.has_invested;
      }
    } catch {
      // Riesgo no disponible.
    }

    // Perfil conductual.
    try {
      const { data } = await supabase
        .from("behavior_profiles")
        .select("discipline,impulsivity,consistency,review_habit,hardest")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        if (data.discipline != null) ctx.discipline = data.discipline;
        if (data.impulsivity != null) ctx.impulsivity = data.impulsivity;
        if (data.review_habit) ctx.reviewHabit = String(data.review_habit).replaceAll("_", " ");
        const hardest = asStrings(data.hardest);
        if (hardest.length) ctx.hardest = hardest;
      }
    } catch {
      // Conducta no disponible.
    }

    // Conocimiento financiero.
    try {
      const { data } = await supabase
        .from("knowledge_profiles")
        .select("level,topics_to_learn")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        if (data.level) ctx.knowledgeLevel = data.level;
        const topics = asStrings(data.topics_to_learn);
        if (topics.length) ctx.topicsToLearn = topics;
      }
    } catch {
      // Conocimiento no disponible.
    }

    // Preferencias de coaching.
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("coaching_tone,coaching_frequency,alert_intensity")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        if (data.coaching_tone) ctx.coachingTone = data.coaching_tone;
        if (data.coaching_frequency) ctx.coachingFrequency = data.coaching_frequency;
        if (data.alert_intensity) ctx.alertIntensity = data.alert_intensity;
      }
    } catch {
      // Settings no disponibles.
    }

    // Prioridades (top 3 de las que el usuario prioriza, por rank).
    try {
      const { data } = await supabase
        .from("user_priorities")
        .select("priority,rank")
        .eq("user_id", user.id)
        .eq("kind", "prioriza")
        .order("rank", { ascending: true, nullsFirst: false })
        .limit(3);
      const priorities = (data ?? [])
        .map((r) => r.priority)
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map((p) => p.replaceAll("_", " "));
      if (priorities.length) ctx.priorities = priorities;
    } catch {
      // Prioridades no disponibles.
    }

    // Borrador del wizard (personal_profiles.extra.draft): Rich Life + percepción.
    try {
      const { data } = await supabase
        .from("personal_profiles")
        .select("extra")
        .eq("user_id", user.id)
        .maybeSingle();
      const draft = (
        (data?.extra ?? {}) as {
          draft?: {
            richLifePhrase?: unknown;
            richLifeVision?: unknown;
            urgency?: unknown;
            perceivedControl?: unknown;
            dependentsCount?: unknown;
            financialNucleus?: unknown;
            hasEmergencyFund?: unknown;
            dineroPrimero?: unknown;
            explainStyle?: unknown;
            decisionComfort?: unknown;
            incomeStopCoverage?: unknown;
            protectionPerceived?: unknown;
            interventionStyle?: unknown;
            futureImage?: unknown;
            desiredFeeling?: unknown;
          };
        }
      ).draft;
      if (draft) {
        if (typeof draft.richLifePhrase === "string") ctx.richLifePhrase = draft.richLifePhrase;
        if (typeof draft.richLifeVision === "string") ctx.richLifeVision = draft.richLifeVision;
        if (typeof draft.urgency === "string") ctx.urgency = draft.urgency;
        if (typeof draft.perceivedControl === "number") ctx.perceivedControl = draft.perceivedControl;
        if (typeof draft.dependentsCount === "number") ctx.dependentsCount = draft.dependentsCount;
        if (typeof draft.financialNucleus === "string") ctx.financialNucleus = draft.financialNucleus;
        if (typeof draft.hasEmergencyFund === "string") ctx.hasEmergencyFund = draft.hasEmergencyFund;
        // Personalización (Fase 3c) — campos que NO son ranking.
        if (typeof draft.explainStyle === "string") ctx.explainStyle = draft.explainStyle;
        if (typeof draft.decisionComfort === "string")
          ctx.decisionComfort = draft.decisionComfort.replaceAll("_", " ");
        if (typeof draft.incomeStopCoverage === "string")
          ctx.monthsCoverage = draft.incomeStopCoverage.replaceAll("_", " ");
        if (typeof draft.protectionPerceived === "string")
          ctx.protectionPerceived = draft.protectionPerceived.replaceAll("_", " ");
        if (Array.isArray(draft.desiredFeeling)) {
          const feelings = draft.desiredFeeling.filter((x): x is string => typeof x === "string");
          if (feelings.length) ctx.desiredFeelings = feelings;
        }
        // Campos RANKEADOS (lifeStage, preocupación, pérdidas, dinero primero, Rich Life,
        // futuro, intervención): serializados como "primaria/secundaria/terciaria". Mismo
        // helper que WhatsApp → sin divergencia. Sobrescribe la primaria de columnas.
        applyRankedProfile(ctx, draft as Record<string, unknown>);
      }
    } catch {
      // Borrador no disponible.
    }
  } catch {
    // Sin cliente de sesión: el contexto sigue con lo que ya tiene.
  }

  // Estado REAL de los fondos de defensa (metas defensa:fondo_*, scope de hogar). SUPERSEDE al
  // hasEmergencyFund auto-reportado del onboarding: si hay un fondo registrado, esos datos MANDAN
  // (el chat decía "no tenés fondo" pese a estar registrado). Va DESPUÉS del bloque de perfil para
  // pisar el auto-reporte. Best-effort: sin sesión/lectura falla → se queda el auto-reporte.
  if (scope.defense) try {
    const { getDefenseFundsReport } = await import("@/modules/wealth");
    const d = await getDefenseFundsReport();
    // El reporte viene en la principal (d.currency) → se CONVIERTE a la de visualización (montos; el % no).
    const fund = (f: { current: number; target: number; progressPct: number; recommendedMonthly: number; covered: boolean }, registrado: boolean) => ({
      registrado,
      actual: toDisplay(f.current),
      objetivo: toDisplay(f.target),
      progresoPct: Math.round(f.progressPct * 100),
      aporteRecomendado: toDisplay(f.recommendedMonthly),
      cubierto: f.covered,
    });
    // ¿toDisplay convirtió de verdad? Ojo: cuando el FX falla, `rates` queda como {} (el catch del
    // bloque base), truthy pero inservible — y convertCurrency devuelve el monto SIN convertir. Así
    // que no alcanza con "hay rates": tiene que existir la tasa de AMBAS monedas. Si no, los montos
    // siguen en la principal → no se marcan como convertidos y se rotulan con SU moneda, no con la
    // de display.
    const distinta = !!primaryCurrency && primaryCurrency !== ctx.currency;
    const puedeConvertir = !!primaryCurrency && !!rates?.[primaryCurrency] && !!rates?.[ctx.currency];
    const huboConversion = distinta && puedeConvertir;
    const sinConvertir = distinta && !puedeConvertir;
    ctx.defenseFunds = {
      currency: sinConvertir && primaryCurrency ? primaryCurrency : ctx.currency,
      activeFund: d.activeFund,
      emergency: fund(d.emergency, d.emergencyRegistered),
      paz: fund(d.peace, d.peaceRegistered),
      convertido: huboConversion,
      ...(huboConversion ? { monedaOrigen: primaryCurrency } : {}),
    };
    // Supersede: si el fondo de emergencia está registrado, hasEmergencyFund refleja lo REAL
    // (cubierto → "si"; parcial → "construyendo"), no el auto-reporte viejo. Así el guardrail y las
    // reglas dejan de tratar al usuario como "sin fondo".
    if (d.emergencyRegistered) {
      ctx.hasEmergencyFund = d.emergency.covered ? "si" : "construyendo";
    }
  } catch {
    // Sin fondos de defensa disponibles: se queda el auto-reporte del perfil.
  }

  // Entidades vinculables: la IA puede proponer transacciones ya vinculadas.
  if (scope.flavor) try {
    const { listLinkableEntities } =
      await import("@/modules/financial-base/services/linkable-entities-service");
    const linkables = await listLinkableEntities();
    ctx.linkables = {
      debt: linkables.debt.map((e) => ({ id: e.id, name: e.name })),
      goal: linkables.goal.map((e) => ({ id: e.id, name: e.name })),
    };
  } catch {
    // Sin vinculables: la IA propone sin vínculo.
  }

  // Memoria conductual (Fase 4c): observaciones recientes para que el asesor las
  // mencione con tacto. getActiveInsights dispara refreshInsights (auto-activación).
  if (scope.flavor) try {
    const { getActiveInsights } = await import("@/lib/insights");
    const items = await getActiveInsights(4);
    if (items.length)
      ctx.insights = items.map((i) => ({ severity: i.severity, title: i.title, body: i.body }));
  } catch {
    // Sin insights: el contexto sigue.
  }

  // Entorno macro/micro: indicadores económicos del entorno (no del usuario).
  // Best-effort; cada lectura en su propio try/catch para que un fallo aislado no
  // degrade el resto. Si un indicador no tiene datos (value null), no se inyecta.
  if (scope.flavor) try {
    const { getLatest, getChange } = await import("@/lib/economic-indicators");

    // Helper: lee el último valor de un código y, si existe, lo asigna.
    const setLatest = async (code: string, set: (v: number) => void): Promise<void> => {
      try {
        const r = await getLatest(code);
        if (r) set(r.value);
      } catch {
        // lectura aislada
      }
    };

    // Inflación interanual del IPC de la moneda PRINCIPAL del usuario (en la que gana y gasta), no
    // de la de visualización: el toggle del topbar cambia cómo MIRA sus totales, no en qué economía
    // vive. Con ctx.currency (display desde #560), un tico que ponía el switch en dólares recibía el
    // IPC de EE. UU. como "su" inflación — y el prompt le ordena al asesor citarla al aconsejar
    // sobre deuda e inversión. Sin moneda principal (el bloque base falló) no se adivina: se omite.
    try {
      if (primaryCurrency) {
        const { getYoYInflation } = await import("@/lib/economic-indicators/insights");
        const cpiCode = primaryCurrency === "CRC" ? "IPC" : "US_CPI";
        const infl = await getYoYInflation(cpiCode);
        if (infl !== null) ctx.inflacionYoYPct = infl * 100;
      }
    } catch {
      // inflación no disponible
    }

    // TBP + variación 6m (puntos porcentuales).
    try {
      const tbp = await getLatest("TBP");
      if (tbp) {
        ctx.tbpPct = tbp.value;
        const ch = await getChange("TBP", 6);
        if (ch.absChange !== null) ctx.tbpChange6mPp = ch.absChange;
      }
    } catch {
      // TBP no disponible
    }

    await setLatest("TPM", (v) => {
      ctx.tpmPct = v;
    });
    await setLatest("USDCRC_VENTA", (v) => {
      ctx.tipoCambioVenta = v;
    });
    await setLatest("FED_FUNDS", (v) => {
      ctx.fedFundsPct = v;
    });
    await setLatest("US_TREASURY_10Y", (v) => {
      ctx.treasury10yPct = v;
    });

    // Lecturas del entorno (macro-insights deterministas).
    try {
      const { getMacroInsights } = await import("@/modules/wealth");
      const mi = await getMacroInsights();
      if (mi.length)
        ctx.macroInsights = mi.map((m) => ({ title: m.title, body: m.body, tone: m.tone }));
    } catch {
      // macro-insights no disponibles
    }
  } catch {
    // Indicadores económicos no disponibles: el contexto sigue.
  }

  return ctx;
}
