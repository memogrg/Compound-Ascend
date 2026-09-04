import "server-only";

/**
 * Servicio de la memoria conductual (insights). Respeta RLS (cliente de sesión).
 * Los detectores (4b+) producen DetectedInsight[] y llaman a syncInsights; aquí
 * solo vive la persistencia, la lectura priorizada y la guardia de frescura.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { now as simNow } from "@/lib/time/clock";
import { getActiveHouseholdId } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import {
  runDetectors,
  detectDisfruteSpike,
  detectOpenContributions,
  detectOverspentEnvelopes,
  detectLowSavingsRate,
  detectExpensiveDebt,
  detectEmergencyFundGap,
  detectConcentration,
  detectReturnBelowInflation,
} from "@/lib/insights/detectors";
import type { Debt } from "@/modules/control/types";
import type { UserInsightRow } from "@/lib/supabase/database.types";
import type {
  DetectedInsight,
  Insight,
  InsightKind,
  InsightRelatedKind,
  InsightSeverity,
  InsightStatus,
} from "@/lib/insights/types";

/** Prioridad de lectura: lo accionable primero, lo celebrable al final. */
const SEVERITY_RANK: Record<InsightSeverity, number> = {
  accionar: 0,
  observar: 1,
  info: 2,
  celebrar: 3,
};

function rowToInsight(r: UserInsightRow): Insight {
  return {
    kind: r.kind as InsightKind,
    severity: r.severity as InsightSeverity,
    title: r.title,
    body: r.body,
    metric: r.metric ?? undefined,
    relatedKind: (r.related_kind ?? undefined) as InsightRelatedKind | undefined,
    relatedId: r.related_id ?? undefined,
    id: r.id,
    status: r.status as InsightStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Clave de identidad de un insight (kind + entidad relacionada). */
const keyOf = (kind: string, relatedId: string | null | undefined): string =>
  `${kind}::${relatedId ?? ""}`;

/**
 * Espejo de daily-insight.RITUAL_KIND (evita un import estático del barrel de
 * wealth —que arrastra componentes— en esta capa). El ritual se gestiona en su
 * propia función (related_id null), por eso syncInsights NO debe resolverlo.
 */
const RITUAL_KIND = "ritual_patrimonio";

/**
 * Kinds que `syncInsights` NO resuelve automáticamente.
 *
 * La reconciliación normal cierra todo activo que la pasada no vuelva a emitir
 * — así es como un insight se auto-resuelve cuando su causa desaparece. Pero un
 * aviso que NINGÚN detector emite (porque es un hecho puntual, no una condición
 * medible) moriría en la primera pasada. Estos dos se gestionan aparte:
 *   · el ritual patrimonial, que tiene su propia función de escritura;
 *   · el aviso de frecuencia de ingreso, sembrado una sola vez para las cuentas
 *     cuyas fuentes se normalizaron a "mensual". Vive hasta que la persona lo
 *     descarta (el descarte sí persiste).
 */
const KINDS_SIN_RECONCILIAR = new Set<string>([RITUAL_KIND, "frecuencia_ingreso_revisar"]);

/**
 * Orquestador on-demand: si la última corrida está vieja, recalcula los insights
 * a partir de los datos de control y los sincroniza. Best-effort: nunca rompe.
 */
export async function refreshInsights(ctx?: AuthContext): Promise<void> {
  try {
    const last = await getInsightsFreshness(ctx);
    if (!isStale(last)) return; // guardia de frescura
    // Import dinámico para no acoplar lib/insights con el módulo control.
    const { listGoals, listDebts } = await import("@/modules/control/services/control-service");
    const [goals, debts] = await Promise.all([listGoals(ctx), listDebts(ctx)]);
    const detected = runDetectors({ goals, debts }, simNow());
    const spend = await getDisfruteSpend(ctx);
    if (spend) detected.push(...detectDisfruteSpike(spend));
    try {
      const { listOpenContributions } =
        await import("@/modules/wealth/services/contribution-service");
      const contribs = await listOpenContributions(ctx);
      detected.push(...detectOpenContributions(contribs));
    } catch {
      // best-effort: si falla, no bloquea el resto de los insights.
    }
    try {
      // Recordatorio del fondo de paz (F2). best-effort.
      const { getDefenseFundsReport, monthsCovered } = await import("@/modules/wealth");
      const { detectPeaceFundGap } = await import("@/lib/insights/detectors");
      const plan = await getDefenseFundsReport(ctx);
      const essentialMonthly = plan.peace.months > 0 ? plan.peace.target / plan.peace.months : 0;
      detected.push(
        ...detectPeaceFundGap({
          emergencyCovered: plan.emergency.covered,
          peaceCovered: plan.peace.covered,
          monthsActual: monthsCovered(plan.peace.current, essentialMonthly),
          peaceMonths: plan.peace.months,
          recommendedMonthly: plan.peace.recommendedMonthly,
          currency: plan.currency,
        }),
      );
    } catch {
      // best-effort.
    }
    // Presupuesto y real del mes, UNA sola vez. Los necesitan dos detectores distintos —los
    // sobres sobregirados y el ritmo de gasto— y cada llamada arrastra conversión de moneda,
    // tasas FX y el mapa de categorías. Calcularlos dos veces no solo duplicaba ese costo en
    // un camino que corre desde el chat: también abría la puerta a que los dos avisos
    // dijeran cifras distintas del mismo sobre si algo cambiaba entre una lectura y la otra.
    const mes = await getMesActual(ctx);

    detected.push(...(await detectDamageSignals(debts, mes, ctx)));
    detected.push(...(await detectMonthRhythm(mes, ctx)));

    // ── Salud del feed de precios ──
    // Va acá y no en la valuación porque es una lectura de estado, no un efecto: mira qué tan
    // viejo está el store para las posiciones cotizadas de ESTE usuario. Best-effort, como el
    // resto: si falla, el resto de los insights sale igual.
    try {
      const { detectStaleMarketFeed } = await import("@/lib/insights/detectors");
      const { resumirFrescura } = await import("@/lib/market-data/freshness");
      const { listHoldings } = await import("@/modules/wealth/services/holdings-service");
      const holdings = await listHoldings(ctx);
      const cotizadas = holdings
        .filter((h) => ["etf", "accion", "cripto"].includes(h.assetType))
        .map((h) => ({ symbol: h.symbol, assetType: h.assetType as string }));
      if (cotizadas.length > 0) {
        const { db } = await resolveAuth(ctx);
        const { data } = await db
          .from("market_price_cache")
          .select("symbol,asset_type,fetched_at")
          .in("symbol", [...new Set(cotizadas.map((h) => h.symbol.toUpperCase()))]);
        const frescura = resumirFrescura({
          filas: data ?? [],
          cotizadas,
          ahora: Date.now(),
        });
        if (frescura.stale) {
          // El log es para NOSOTROS (el insight es para el usuario): un feed caído es un
          // incidente de producto, y sin esta línea solo se descubre cuando una respuesta
          // sale mal — que es exactamente como se descubrió la última vez.
          logger.warn("market-data: store stale para un usuario", {
            posicionesCotizadas: frescura.posicionesCotizadas,
            sinPrecioFresco: frescura.posicionesSinPrecioFresco,
            horasDesdeUltimoPrecio: frescura.horasDesdeUltimoPrecio,
          });
        }
        detected.push(...detectStaleMarketFeed(frescura));
      }
    } catch {
      // best-effort: sin salud del feed, el resto de los insights sale igual.
    }

    await syncInsights(detected, ctx);
  } catch (err) {
    logger.warn("refreshInsights fallido", { message: err instanceof Error ? err.message : "?" });
  }
}

/**
 * La foto del mes que comparten TODOS los detectores de sobres.
 *
 * Vive en lib/rhythm y está cacheada por request (`getFotoDelMes`), así que el
 * context-engine del asesor —que corre en cada mensaje del chat— la reusa en vez de volver a
 * leer presupuesto, gasto y categorías. Antes acá había un loader propio y eso hacía que la
 * misma consulta se pagara dos veces por pasada.
 *
 * `null` si no se pudo calcular: quien la recibe se salta su bloque en vez de recalcular por
 * su cuenta — recalcular es justamente lo que se quiere evitar.
 */
type MesActual = Awaited<ReturnType<typeof import("@/lib/rhythm/rhythm-service").getFotoDelMes>>;

async function getMesActual(ctx?: AuthContext): Promise<MesActual> {
  try {
    const { getFotoDelMes } = await import("@/lib/rhythm/rhythm-service");
    const { userToday } = await import("@/lib/time/user-time");
    const { monthPeriod } = await import("@/modules/financial-base/engine/period");
    const todayIso = await userToday(ctx);
    return await getFotoDelMes(
      monthPeriod(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7))),
      ctx,
    );
  } catch (err) {
    logger.warn("getMesActual fallido", { message: err instanceof Error ? err.message : "?" });
    return null;
  }
}

/**
 * Señales de DAÑO: sobres sobregirados, tasa de ahorro, deuda cara, fondo de emergencia,
 * concentración y rendimiento contra la inflación.
 *
 * Cada bloque va en su propio try/catch: son lecturas de módulos distintos y una caída (un
 * proveedor de precios, una tabla vacía) no puede dejar sin insights a los demás. Todo es
 * LECTURA — nada de escrituras acá, porque refreshInsights también corre desde el context-engine
 * del asesor (ver CLAUDE.md).
 *
 * `debts` y `mes` se reciben ya cargados para no volver a pedirlos.
 */
async function detectDamageSignals(
  debts: Debt[],
  mes: MesActual,
  ctx?: AuthContext,
): Promise<DetectedInsight[]> {
  const out: DetectedInsight[] = [];

  // Deuda cara por TASA (la de atraso ya la ve runDetectors). Sin IO: la lista ya está.
  try {
    out.push(...detectExpensiveDebt(debts));
  } catch {
    // best-effort
  }

  // Sobres pasados de presupuesto este mes. Los sobres ya vienen armados en `mes`: el mismo
  // arreglo que usa el detector de ritmo, para que las dos tarjetas no puedan discrepar.
  try {
    if (mes) out.push(...detectOverspentEnvelopes({ sobres: mes.sobres, currency: mes.currency }));
  } catch {
    // best-effort
  }

  // Tasa de ahorro del mes (misma cifra que ve el usuario en su base financiera).
  try {
    const { getBaseSummary, getDisplayCurrency } = await import("@/modules/financial-base");
    const [base, currency] = await Promise.all([getBaseSummary(ctx), getDisplayCurrency(ctx)]);
    out.push(
      ...detectLowSavingsRate({
        savingsRate: base.indicators.savingsRate,
        incomeMonthly: base.indicators.incomeMonthly,
        freeCashflow: base.indicators.freeCashflow,
        currency,
      }),
    );
  } catch {
    // best-effort
  }

  // Fondo de EMERGENCIA incompleto (el de paz ya se detecta arriba, y exige este cubierto).
  try {
    const { getDefenseFundsReport } = await import("@/modules/wealth");
    const plan = await getDefenseFundsReport(ctx);
    out.push(
      ...detectEmergencyFundGap({
        covered: plan.emergency.covered,
        current: plan.emergency.current,
        target: plan.emergency.target,
        recommendedMonthly: plan.emergency.recommendedMonthly,
        currency: plan.currency,
      }),
    );
  } catch {
    // best-effort
  }

  // Portafolio: concentración y rendimiento contra la inflación. Una sola lectura para los dos.
  try {
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const { concentrationByAsset } = await import("@/modules/wealth/engine/portfolio-engine");
    const report = await getPortfolioReport(ctx);
    const a = report.analytics;
    out.push(
      ...detectConcentration({
        slices: concentrationByAsset(a.holdingsWithPerformance).map((s) => ({
          label: s.label,
          pct: s.pct,
        })),
        totalValue: a.totalPortfolioValue,
      }),
    );
    try {
      // El IPC de la moneda PRINCIPAL (en la que gana y gasta), no la de visualización — mismo
      // criterio que el context-engine. getYoYInflation ya devuelve una proporción (0..1).
      const { getPrimaryCurrency } = await import("@/modules/financial-base");
      const { getYoYInflation } = await import("@/lib/economic-indicators/insights");
      const primary = await getPrimaryCurrency(ctx);
      const infl = await getYoYInflation(primary === "CRC" ? "IPC" : "US_CPI");
      if (infl != null)
        out.push(
          ...detectReturnBelowInflation({
            returnPct: a.totalReturnPct,
            inflationPct: infl,
            totalValue: a.totalPortfolioValue,
          }),
        );
    } catch {
      // sin macro no se afirma nada sobre inflación
    }
  } catch {
    // best-effort
  }

  return out;
}

/**
 * EL RITMO DEL MES: ventana de configuración (días 1-5), cierre de mes (28→fin) y
 * recordatorio diario de registro. Ver lib/rhythm/.
 *
 * Entran por ACÁ, en el mismo array que el resto, y no por un cron propio. `syncInsights`
 * marca 'resuelto' todo activo que no venga en la pasada: unos detectores escribiendo
 * desde un cron y otros desde la sesión se irían matando entre sí, alternando la campana
 * entre dos conjuntos de insights. Un solo array, una sola verdad.
 *
 * El beneficio de estar acá es la auto-limpieza gratis: el día 6 la ventana deja de
 * emitirse y su tarjeta se cierra sola; el usuario registra un gasto y el recordatorio
 * del día desaparece en la siguiente pasada. Nadie borra nada a mano.
 *
 * Todo LECTURA (esta función también corre desde el context-engine del asesor). Cada
 * bloque en su propio try/catch: los tres son independientes.
 */
async function detectMonthRhythm(mes: MesActual, ctx?: AuthContext): Promise<DetectedInsight[]> {
  const out: DetectedInsight[] = [];
  if (!mes) return out;
  try {
    const { userHour } = await import("@/lib/time/user-time");
    const { detectVentanaPresupuesto, detectCierreMes, detectRegistroDiario } =
      await import("@/lib/rhythm/detectors");
    const { getMonthConfig, getConteosCierre, contarMovimientosHoy } =
      await import("@/lib/rhythm/rhythm-service");

    const { period, dia, todayIso: today } = mes;
    const { year, month } = period;

    // Ventana de configuración. El conteo de sobres con monto sale de `mes.sobres`, no de una
    // consulta propia: ya está calculado y solo hace falta el número.
    try {
      const config = await getMonthConfig(period, ctx);
      out.push(
        ...detectVentanaPresupuesto({
          dia,
          year,
          month,
          closedAt: config.closedAt,
          sobresConPresupuesto: mes.sobres.filter((x) => x.budget > 0).length,
        }),
      );
    } catch {
      // best-effort
    }

    // Cierre de mes. Los conteos son la parte cara (transacciones + metas + deudas +
    // presupuesto), así que ni se piden fuera de los días de cierre.
    try {
      const { enDiasDeCierre } = await import("@/lib/rhythm/engine");
      if (enDiasDeCierre({ dia, year, month })) {
        const conteos = await getConteosCierre(period, ctx);
        out.push(...detectCierreMes({ dia, year, month, conteos }));
      }
    } catch {
      // best-effort
    }

    // Recordatorio diario. Ojo: la campana lo muestra con hasta 12 h de retraso por la
    // guardia de frescura, así que la superficie fiel es el pop-up en vivo
    // (getRhythmState). Acá igual se emite para que quede registro en "Qué noté".
    try {
      const [hora, movimientosHoy] = await Promise.all([userHour(ctx), contarMovimientosHoy(ctx)]);
      out.push(...detectRegistroDiario({ todayIso: today, horaLocal: hora, movimientosHoy }));
    } catch {
      // best-effort
    }

    // Ritmo de gasto por sobre (Fase B). El tope semanal por sobre lo impone la clave del
    // insight (la semana va dentro de related_id), no un contador acá.
    //
    // Se llama a `detectarRitmo` (motor puro) con los sobres YA cargados, en vez de a
    // `getSenalesRitmo` —que volvería a pedir presupuesto y real—. Además de ahorrar la
    // lectura, garantiza que el aviso de ritmo y el de sobregiro hablen de las mismas cifras.
    try {
      const { detectRitmoSobre } = await import("@/lib/rhythm/detectors");
      const { detectarRitmo } = await import("@/lib/rhythm/spend-pace");
      const { formatMoney } = await import("@/lib/format");
      const senales = detectarRitmo({
        sobres: mes.sobres,
        dia,
        diasDelMes: mes.diasDelMes,
        currency: mes.currency,
      });
      if (senales.length > 0) {
        out.push(...detectRitmoSobre({ senales, dia, todayIso: today, fmt: formatMoney }));
      }
    } catch {
      // best-effort
    }

    // Sobres OCIOSOS (Fase C). Sale de la MISMA foto: el gasto acumulado de la ventana ya
    // viene en `mes.historico`. La clave del insight es mensual, así que aunque esta pasada
    // corra dos veces al día el usuario ve una sola tarjeta.
    try {
      const { detectSobreOcioso } = await import("@/lib/rhythm/detectors");
      const { detectarOciosos } = await import("@/lib/rhythm/idle-envelopes");
      const { formatMoney } = await import("@/lib/format");
      const ociosos = detectarOciosos({
        sobres: mes.historico,
        mesesVentana: mes.mesesHistoria,
        currency: mes.currency,
      });
      if (ociosos.length > 0) {
        out.push(...detectSobreOcioso({ ociosos, todayIso: today, fmt: formatMoney }));
      }
    } catch {
      // best-effort
    }
  } catch (err) {
    logger.warn("detectMonthRhythm fallido", {
      message: err instanceof Error ? err.message : "?",
    });
  }
  return out;
}

/**
 * Gasto del "frasco de jugar" (categoría 'disfrute' + descendientes): total del
 * mes actual vs promedio de los 3 meses previos. null si no hay categoría disfrute.
 */
async function getDisfruteSpend(ctx?: AuthContext): Promise<{
  current: number;
  priorAvg: number;
  categoryId: string;
} | null> {
  const { listCategories } = await import("@/modules/financial-base/services/categories-service");
  const { listTransactions } =
    await import("@/modules/financial-base/services/transaction-service");
  const { previousMonthPeriod } = await import("@/modules/financial-base/engine/period");

  const cats = await listCategories(ctx);
  const root = cats.find((c) => c.key === "disfrute");
  if (!root) return null;

  // IDs del frasco de jugar: la categoría disfrute + todos sus descendientes.
  const ids = new Set<string>([root.id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of cats) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }

  const sumFor = async (period: ReturnType<typeof previousMonthPeriod>): Promise<number> => {
    const txns = await listTransactions(period, { kind: "gasto" }, undefined, ctx);
    return txns
      .filter((t) => t.categoryId && ids.has(t.categoryId))
      .reduce((acc, t) => acc + t.amount, 0);
  };

  const { userCurrentPeriod } = await import("@/lib/time/user-time");
  const cur = await userCurrentPeriod(ctx);
  const p1 = previousMonthPeriod(cur);
  const p2 = previousMonthPeriod(p1);
  const p3 = previousMonthPeriod(p2);

  const [current, s1, s2, s3] = await Promise.all([
    sumFor(cur),
    sumFor(p1),
    sumFor(p2),
    sumFor(p3),
  ]);
  return { current, priorAvg: (s1 + s2 + s3) / 3, categoryId: root.id };
}

/**
 * Ritual diario patrimonial: genera (in-app, on-demand) UN insight del día con
 * el Marco Patrimonial y lo deja activo en user_insights para "Qué noté". Reusa
 * getPatrimonioReport por sesión; guardia diaria; uno activo a la vez. Best-effort.
 */
export async function refreshDailyPatrimonioInsight(ctx?: AuthContext): Promise<void> {
  try {
    const { db: supabase, userId } = await resolveAuth(ctx);

    // Guardia diaria: si ya se generó un ritual fresco (<20 h), no regenerar.
    // Sin filtrar por status: un ritual descartado también cuenta como "el del
    // día" — si la guardia solo mirara activos, descartarlo la vaciaría y el
    // ritual renacería en la misma lectura (imposible cerrarlo).
    const { data: last } = await supabase
      .from("user_insights")
      .select("updated_at")
      .eq("user_id", userId)
      .eq("kind", RITUAL_KIND)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isStale(last?.updated_at ? new Date(last.updated_at) : null, 20)) return;

    const { getPatrimonioReport, buildDailyPatrimonioInsight } = await import("@/modules/wealth");
    const { report, level, diagnosis } = await getPatrimonioReport(ctx);
    const detected = buildDailyPatrimonioInsight(report, level, diagnosis);
    const household_id = await getActiveHouseholdId(supabase, userId);

    // Uno activo a la vez: como related_id es null, el upsert no dedupea; cerramos
    // el ritual previo y luego insertamos el nuevo.
    await supabase
      .from("user_insights")
      .update({ status: "resuelto" })
      .eq("user_id", userId)
      .eq("kind", RITUAL_KIND)
      .eq("status", "activo");
    await supabase.from("user_insights").insert({
      user_id: userId,
      household_id,
      kind: detected.kind,
      severity: detected.severity,
      title: detected.title,
      body: detected.body,
      metric: detected.metric ?? null,
      related_kind: detected.relatedKind ?? null,
      related_id: detected.relatedId ?? null,
      status: "activo" as const,
    });
  } catch (err) {
    logger.warn("refreshDailyPatrimonioInsight fallido", {
      message: err instanceof Error ? err.message : "?",
    });
  }
}

/**
 * Escritura del ritual SIN sesión (cron/push): mismo efecto que la versión 5a
 * pero con cliente service-role. Resuelve household_id por userId, cierra el
 * ritual activo previo e inserta el nuevo. Filtra SIEMPRE por userId explícito.
 */
export async function writeDailyInsightForUserCron(
  userId: string,
  detected: DetectedInsight,
): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const household_id = await getActiveHouseholdId(admin, userId);

  // Uno activo a la vez (related_id null no dedupea en upsert): cerrar el previo,
  // luego insertar el nuevo.
  await admin
    .from("user_insights")
    .update({ status: "resuelto" })
    .eq("user_id", userId)
    .eq("kind", RITUAL_KIND)
    .eq("status", "activo");
  await admin.from("user_insights").insert({
    user_id: userId,
    household_id,
    kind: detected.kind,
    severity: detected.severity,
    title: detected.title,
    body: detected.body,
    metric: detected.metric ?? null,
    related_kind: detected.relatedKind ?? null,
    related_id: detected.relatedId ?? null,
    status: "activo" as const,
  });
}

/**
 * Genera y persiste el ritual del día para UN usuario (service-role): corre el
 * reporte patrimonial sin sesión, construye el insight y lo escribe. Lanza si
 * algo falla (el orquestador lo trata best-effort).
 */
export async function generateDailyRitualForUser(userId: string): Promise<void> {
  const { getPatrimonioReportForUser, buildDailyPatrimonioInsight } =
    await import("@/modules/wealth");
  const { report, level, diagnosis } = await getPatrimonioReportForUser(userId);
  const detected = buildDailyPatrimonioInsight(report, level, diagnosis);
  await writeDailyInsightForUserCron(userId, detected);
}

/**
 * Itera usuarios best-effort: si uno falla, loguea y sigue con los demás.
 * Puro/testeable (la función por-usuario se inyecta). Devuelve conteos.
 */
export async function runForUsersBestEffort(
  userIds: string[],
  fn: (userId: string) => Promise<void>,
): Promise<{ total: number; ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await fn(userId);
      ok += 1;
    } catch (err) {
      failed += 1;
      logger.warn("ritual cron: usuario falló", {
        userId,
        message: err instanceof Error ? err.message : "?",
      });
    }
  }
  return { total: userIds.length, ok, failed };
}

/** Genera el ritual del día para TODOS los usuarios (Vercel Cron). Best-effort. */
export async function generateDailyRitualForAllUsers(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: users } = await admin.from("profiles").select("id");
  const ids = (users ?? []).map((u) => u.id);
  return runForUsersBestEffort(ids, generateDailyRitualForUser);
}

/** Insights activos, priorizados por severidad y luego por recencia. */
export async function getActiveInsights(limit = 5, ctx?: AuthContext): Promise<Insight[]> {
  // Auto-activación: cualquier lectura refresca si está viejo (best-effort).
  await refreshInsights(ctx);
  await refreshDailyPatrimonioInsight(ctx);
  const { db: supabase, userId } = await resolveAuth(ctx);
  const { data } = await supabase
    .from("user_insights")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "activo");
  const rows = (data ?? []).map(rowToInsight);
  rows.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
  );
  return rows.slice(0, limit);
}

/** Última actualización de insights del usuario (guardia de frescura para 4b). */
export async function getInsightsFreshness(ctx?: AuthContext): Promise<Date | null> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const { data } = await supabase
    .from("user_insights")
    .select("updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.updated_at ? new Date(data.updated_at) : null;
}

/**
 * Sincroniza los insights detectados: upsert por (user_id, kind, related_id) y
 * marca 'resuelto' los activos cuyo (kind, related_id) ya no aparece en `detected`.
 */
export async function syncInsights(detected: DetectedInsight[], ctx?: AuthContext): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const household_id = await getActiveHouseholdId(supabase, userId);

  if (detected.length > 0) {
    // El upsert fija status 'activo': si incluyera keys descartadas las
    // reviviría. Un descarte persiste hasta que el usuario lo revierte con
    // "Recordar acciones" (restoreDismissedInsights).
    const { data: dismissed } = await supabase
      .from("user_insights")
      .select("kind, related_id")
      .eq("user_id", userId)
      .eq("status", "descartado");
    const dismissedKeys = new Set((dismissed ?? []).map((d) => keyOf(d.kind, d.related_id)));
    const rows = detected
      .filter((d) => !dismissedKeys.has(keyOf(d.kind, d.relatedId)))
      .map((d) => ({
        user_id: userId,
        household_id,
        kind: d.kind,
        severity: d.severity,
        title: d.title,
        body: d.body,
        metric: d.metric ?? null,
        related_kind: d.relatedKind ?? null,
        related_id: d.relatedId ?? null,
        status: "activo" as const,
      }));
    if (rows.length > 0) {
      // El error se MIRA. Es un upsert en lote: una sola fila inválida aborta el statement
      // completo y el usuario se queda sin ningún insight de la pasada. Tragarlo en silencio fue
      // exactamente lo que dejó vivo el bug de related_kind='holding' — sin este log, la única
      // señal es una campana vacía, que parece "no hay nada que decirte".
      const { error } = await supabase
        .from("user_insights")
        .upsert(rows, { onConflict: "user_id,kind,related_id" });
      if (error)
        logger.warn("syncInsights: upsert rechazado (se pierde la pasada completa)", {
          message: error.message,
          rows: rows.length,
          kinds: [...new Set(rows.map((r) => r.kind))].join(","),
        });
    }
  }

  // Cierra los activos que ya no detecta ninguna pasada (se consideran resueltos).
  const { data: actives } = await supabase
    .from("user_insights")
    .select("id, kind, related_id")
    .eq("user_id", userId)
    .eq("status", "activo");
  const present = new Set(detected.map((d) => keyOf(d.kind, d.relatedId)));
  const toResolve = (actives ?? [])
    // El ritual patrimonial y los avisos únicos se gestionan aparte; no los
    // resuelve esta pasada (ver KINDS_SIN_RECONCILIAR).
    .filter((a) => !KINDS_SIN_RECONCILIAR.has(a.kind) && !present.has(keyOf(a.kind, a.related_id)))
    .map((a) => a.id);
  if (toResolve.length > 0) {
    await supabase.from("user_insights").update({ status: "resuelto" }).in("id", toResolve);
  }
}

/** Descarta un insight (lo oculta sin marcarlo resuelto). Para la 4d. */
export async function dismissInsight(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_insights")
    .update({ status: "descartado" })
    .eq("id", id)
    .eq("user_id", user.id);
}

/**
 * Restaura los insights descartados ("Recordar acciones" de la campana).
 * Conserva el invariante de UN ritual activo a la vez: si al restaurar
 * coexisten varios, deja solo el más reciente y resuelve los demás. Los
 * insights cuya condición ya no aplica se auto-limpian en la siguiente
 * pasada de detectores (syncInsights los marca 'resuelto').
 */
export async function restoreDismissedInsights(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_insights")
    .update({ status: "activo" })
    .eq("user_id", user.id)
    .eq("status", "descartado");

  const { data: rituals } = await supabase
    .from("user_insights")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", RITUAL_KIND)
    .eq("status", "activo")
    .order("updated_at", { ascending: false });
  const extra = (rituals ?? []).slice(1).map((r) => r.id);
  if (extra.length > 0) {
    await supabase.from("user_insights").update({ status: "resuelto" }).in("id", extra);
  }
}

/** Puro y testeable: ¿la última corrida está vieja (o no existe)? */
export function isStale(last: Date | null, maxAgeHours = 12): boolean {
  if (!last) return true;
  return simNow().getTime() - last.getTime() > maxAgeHours * 60 * 60 * 1000;
}
