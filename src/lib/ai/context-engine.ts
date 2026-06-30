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
import type { FinancialContext } from "@/lib/ai/orchestrator";

/** Coacciona un valor jsonb a string[] (las columnas jsonb llegan como unknown). */
function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function buildFinancialContext(): Promise<FinancialContext> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? undefined;
  if (!isSupabaseConfigured() || !user) return { name, currency: "CRC" };

  let ctx: FinancialContext = { name, currency: "CRC" };

  // Base Financiera: indicadores del mes. El asesor usa SIEMPRE la moneda PRINCIPAL
  // (no getDisplayCurrency(), que honra la cookie de visualización). Pasar un
  // AuthContext explícito hace que getBaseSummary normalice los indicadores a la
  // primaria (su getDisplayCurrency interno, con ctx, resuelve a primaria), de modo
  // que ctx.currency y todos los montos quedan consistentes en la moneda principal.
  try {
    const { getBaseSummary, getPrimaryCurrency } = await import(
      "@/modules/financial-base/services/base-service"
    );
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const authCtx = { db: await createSupabaseServerClient(), userId: user.id };
    const [base, currency] = await Promise.all([
      getBaseSummary(authCtx),
      getPrimaryCurrency(authCtx),
    ]);
    ctx = {
      ...ctx,
      currency,
      incomeMonthly: base.indicators.incomeMonthly,
      expenseMonthly: base.indicators.expenseMonthly,
      freeCashflow: base.indicators.freeCashflow,
    };
  } catch {
    // Sin base: contexto mínimo.
  }

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

  // Deudas activas: total, cuántas y la más cara.
  try {
    const { listDebts } = await import("@/modules/control/services/control-service");
    const debts = (await listDebts()).filter((d) => d.balance > 0);
    if (debts.length > 0) {
      ctx.debtCount = debts.length;
      ctx.debtTotal = Math.round(debts.reduce((s, d) => s + d.balance, 0));
      const top = debts.reduce((a, b) => ((a.apr ?? 0) >= (b.apr ?? 0) ? a : b));
      ctx.topDebtName = top.name;
      ctx.topDebtApr = top.apr ?? undefined;
    }
  } catch {
    // Control no disponible.
  }

  // Metas: cuántas y avance agregado.
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data: goals } = await supabase
      .from("savings_goals")
      .select("current_amount,target_amount")
      .eq("user_id", user.id);
    if (goals && goals.length > 0) {
      const target = goals.reduce((s, g) => s + Number(g.target_amount), 0);
      const current = goals.reduce((s, g) => s + Number(g.current_amount), 0);
      ctx.goalCount = goals.length;
      if (target > 0) ctx.goalsProgressPct = current / target;
    }
  } catch {
    // Metas no disponibles.
  }

  // Patrimonio neto (Rich Life) — la lectura más cara, best-effort.
  try {
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const summary = await getRichLifeSummary();
    ctx.netWorth = Math.round(summary.snapshot.indicators.netWorth);
    // Respaldo REAL (meses de independencia): señal dura para el guardrail R3 (fondo de paz).
    ctx.emergencyMonths = Math.round(summary.snapshot.indicators.monthsOfIndependence);
  } catch {
    // Rich Life no disponible.
  }

  // Portafolio (best-effort, igual que antes).
  try {
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const report = await getPortfolioReport();
    if (report.analytics.totalPortfolioValue > 0) {
      const topSlice = Object.values(report.analytics.allocation).reduce((a, b) =>
        a.value > b.value ? a : b,
      );
      ctx.portfolioValue = Math.round(report.analytics.totalPortfolioValue);
      ctx.portfolioReturnPct = report.analytics.totalReturnPct;
      ctx.topAssetClass = topSlice.label;
    }
  } catch {
    // Portafolio no disponible.
  }

  // Marco Patrimonial (motor patrimonio-engine) — best-effort: consume el reporte
  // tal cual, sin recalcular. Si falla, el chat sigue sin estas métricas.
  try {
    const { getPatrimonioReport } = await import("@/modules/wealth");
    const p = await getPatrimonioReport();
    ctx.indicePatrimonial = Math.round(p.report.indice);
    ctx.nivelPatrimonial = p.level.name;
    ctx.numeroDeLibertad = Math.round(p.report.numeroDeLibertad);
    ctx.añosDeLibertad = Math.round(p.report.añosDeLibertad);
    ctx.mesesDeLibertad = Math.round(p.report.mesesDeLibertad);
    ctx.coberturaPasivaPct = Math.round(p.report.coberturaPasiva * 100);
    ctx.calidadPatrimonio = Math.round(p.report.calidadPatrimonio);
    ctx.investableWealth = Math.round(p.report.investableWealth);
    ctx.patrimonioDiagnosis = p.diagnosis.map((d) => d.code);
  } catch {
    // Marco Patrimonial no disponible.
  }

  // Perfil conductual (Fase · asesor conductual). Lectura best-effort con el
  // cliente de sesión (respeta RLS); cada tabla en su try/catch para que un fallo
  // aislado no degrade el resto del contexto.
  try {
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
        if (typeof draft.dineroPrimero === "string")
          ctx.dominantValue = draft.dineroPrimero.replaceAll("_", " ");
        // Personalización (Fase 3c).
        if (typeof draft.explainStyle === "string") ctx.explainStyle = draft.explainStyle;
        if (typeof draft.decisionComfort === "string")
          ctx.decisionComfort = draft.decisionComfort.replaceAll("_", " ");
        if (typeof draft.incomeStopCoverage === "string")
          ctx.monthsCoverage = draft.incomeStopCoverage.replaceAll("_", " ");
        if (typeof draft.protectionPerceived === "string")
          ctx.protectionPerceived = draft.protectionPerceived.replaceAll("_", " ");
        if (typeof draft.interventionStyle === "string") ctx.interventionStyle = draft.interventionStyle;
        if (typeof draft.futureImage === "string")
          ctx.futureImage = draft.futureImage.replaceAll("_", " ");
        if (Array.isArray(draft.desiredFeeling)) {
          const feelings = draft.desiredFeeling.filter((x): x is string => typeof x === "string");
          if (feelings.length) ctx.desiredFeelings = feelings;
        }
      }
    } catch {
      // Borrador no disponible.
    }
  } catch {
    // Sin cliente de sesión: el contexto sigue con lo que ya tiene.
  }

  // Entidades vinculables: la IA puede proponer transacciones ya vinculadas.
  try {
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
  try {
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
  try {
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

    // Inflación interanual del IPC de la moneda del usuario; se guarda como %.
    try {
      const { getYoYInflation } = await import("@/lib/economic-indicators/insights");
      const cpiCode = ctx.currency === "CRC" ? "IPC" : "US_CPI";
      const infl = await getYoYInflation(cpiCode);
      if (infl !== null) ctx.inflacionYoYPct = infl * 100;
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
