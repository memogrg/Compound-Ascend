import "server-only";

/**
 * syncDerivedBudget (Fase 3 · interconexión): genera/actualiza las líneas de
 * presupuesto derivadas de entidades para un periodo:
 *   · deudas activas        → gasto "Pago — {deuda}"        (source_kind 'debt')
 *   · metas con aporte      → gasto "Aporte — {meta}"       (source_kind 'goal')
 *   · pólizas con prima     → gasto "Prima — {seguro}"      (source_kind 'policy')
 *   · recurrentes activos   → ingreso/gasto según su kind   (source_kind 'recurring')
 *   · dividendos (12 meses) → ingreso "Dividendos — {pos.}" (source_kind 'dividend')
 *   · renta de inversiones  → ingreso "Ingreso — {posición}" (source_kind 'rental')
 *
 * Las líneas derivadas se editan en su entidad (candado en la UI); las
 * manuales no se tocan. Lecturas: SELECTs ligeros con RLS (mismo criterio que
 * linkable-entities-service para no acoplar módulos). El diff es puro
 * (engine/derived-budget) y el índice único 0023 hace el sync idempotente.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import {
  diffDerived,
  toMonthly,
  type DesiredLine,
  type ExistingDerived,
} from "@/modules/financial-base/engine/derived-budget";
import { getSystemCategoryId } from "@/modules/financial-base/services/linked-transaction-service";
// Motor compartido: vive en `lib/finance` justamente para que financial-base
// pueda usarlo sin importar de wealth (la dirección es wealth → financial-base).
import { calcularRendimiento, esFrecuenciaPago } from "@/lib/finance/rendimiento-periodico";
import type { Period } from "@/modules/financial-base/types";

const POLICY_LABEL: Record<string, string> = {
  medico: "Seguro médico",
  vida: "Seguro de vida",
  incapacidad: "Seguro de incapacidad",
  hogar: "Seguro de hogar",
  vehiculo: "Seguro de vehículo",
  patrimonial: "Seguro patrimonial",
  empresarial: "Seguro empresarial",
  familiar: "Seguro familiar",
  otro: "Seguro",
};

export async function syncDerivedBudget(period: Period): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const twelveMonthsAgo = new Date(period.year, period.month - 13, 1).toISOString().slice(0, 10);

  const [debts, goals, policies, recurring, divs, catDeudas, catSeguros] = await Promise.all([
    supabase
      .from("debts")
      .select("id,name,currency,min_payment,current_payment,is_current,balance")
      .eq("user_id", user.id),
    supabase
      .from("savings_goals")
      .select("id,name,currency,monthly_contribution,status")
      .eq("user_id", user.id),
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider,premium,premium_frequency,currency")
      .eq("user_id", user.id),
    supabase
      .from("recurring_items")
      .select("id,kind,name,amount,currency,frequency,active")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase
      .from("dividends")
      .select("holding_id,amount,currency,payment_date")
      .eq("user_id", user.id)
      .gte("payment_date", twelveMonthsAgo),
    getSystemCategoryId("deudas"),
    getSystemCategoryId("seguros"),
  ]);

  const desired: DesiredLine[] = [];

  for (const d of debts.data ?? []) {
    const cuota = Number(d.current_payment) > 0 ? Number(d.current_payment) : Number(d.min_payment);
    if (!d.is_current || cuota <= 0 || Number(d.balance) <= 0) continue;
    desired.push({
      type: "expense",
      name: `Pago — ${d.name}`,
      amount: Math.round(cuota * 100) / 100,
      currency: d.currency,
      categoryId: catDeudas,
      sourceKind: "debt",
      sourceId: d.id,
    });
  }

  for (const g of goals.data ?? []) {
    const aporte = Number(g.monthly_contribution);
    if (aporte <= 0 || g.status === "no_viable") continue;
    desired.push({
      type: "expense",
      name: `Aporte — ${g.name}`,
      amount: Math.round(aporte * 100) / 100,
      currency: g.currency,
      categoryId: null,
      sourceKind: "goal",
      sourceId: g.id,
    });
  }

  for (const p of policies.data ?? []) {
    const premium = Number(p.premium ?? 0);
    if (premium <= 0) continue;
    const monthly = toMonthly(premium, p.premium_frequency);
    if (monthly <= 0) continue;
    const label = POLICY_LABEL[p.policy_type ?? "otro"] ?? "Seguro";
    desired.push({
      type: "expense",
      name: `Prima — ${label}${p.provider ? ` (${p.provider})` : ""}`,
      amount: monthly,
      currency: p.currency,
      categoryId: catSeguros,
      sourceKind: "policy",
      sourceId: p.id,
    });
  }

  for (const r of recurring.data ?? []) {
    const monthly = toMonthly(Number(r.amount), r.frequency);
    if (monthly <= 0) continue;
    desired.push({
      type: r.kind === "ingreso" ? "income" : "expense",
      name: r.name,
      amount: monthly,
      currency: r.currency,
      categoryId: null,
      sourceKind: "recurring",
      sourceId: r.id,
    });
  }

  // ── Dividendos ──────────────────────────────────────────────────────────
  // Dos fuentes, y la CONFIG manda sobre el historial:
  //
  //  · Si el holding tiene dividendos configurados (`payout_enabled`), la
  //    proyección sale de esa config, con el monto NETO de retención. Es lo que
  //    el usuario declaró que va a cobrar, y está disponible desde el primer día
  //    — sin esperar 12 meses de historial.
  //  · Si no, se conserva el comportamiento previo: promedio de lo REALMENTE
  //    recibido en 12 meses. Es el único dato que hay para una posición que paga
  //    dividendos sin haberlos configurado.
  //
  // Una sola línea por holding en cualquiera de los dos casos: el diff de
  // `diffDerived` la inserta, la actualiza al editar y la borra si el holding
  // deja de pagar. No hace falta ciclo de vida propio.
  const divByHolding = new Map<string, { total: number; currency: string }>();
  for (const dv of divs.data ?? []) {
    const acc = divByHolding.get(dv.holding_id) ?? { total: 0, currency: dv.currency };
    acc.total += Number(dv.amount);
    divByHolding.set(dv.holding_id, acc);
  }

  // Dos consultas y no un `.or(...)` con ids interpolados: ese `.or` rompe la
  // inferencia del cliente tipado (devuelve GenericStringError) y obligaría a
  // castear la fila entera, justo donde se leen siete columnas nuevas.
  // El literal va INLINE en cada select, no en una const: el cliente tipado sólo
  // infiere la forma de la fila desde un string literal — con una variable
  // devuelve GenericStringError y habría que castear la fila entera, justo donde
  // se leen siete columnas nuevas.
  //
  // Y son dos consultas, no un `.or(...)` con ids interpolados, por lo mismo.
  const idsConHistorial = [...divByHolding.keys()];
  const configurados = await supabase
    .from("investment_holdings")
    .select(
      "id,label,symbol,currency,quantity,average_cost,current_value_manual,payout_enabled,payout_mode,payout_rate_pct,payout_amount,payout_frequency,payout_withholding_pct",
    )
    .eq("user_id", user.id)
    .eq("payout_enabled", true);
  const conHistorial =
    idsConHistorial.length > 0
      ? await supabase
          .from("investment_holdings")
          .select(
            "id,label,symbol,currency,quantity,average_cost,current_value_manual,payout_enabled,payout_mode,payout_rate_pct,payout_amount,payout_frequency,payout_withholding_pct",
          )
          .eq("user_id", user.id)
          .in("id", idsConHistorial)
      : { data: null };
  // Unión por id: un holding configurado que ADEMÁS tiene historial aparece en
  // las dos y no puede generar dos líneas.
  const divHoldings = new Map<string, NonNullable<typeof configurados.data>[number]>();
  for (const h of configurados.data ?? []) divHoldings.set(h.id, h);
  for (const h of conHistorial.data ?? []) if (!divHoldings.has(h.id)) divHoldings.set(h.id, h);

  for (const h of divHoldings.values()) {
    const nombre = h.label ?? h.symbol ?? "posición";
    let monthly = 0;
    let currency = h.currency;

    if (h.payout_enabled && esFrecuenciaPago(h.payout_frequency)) {
      // Base del yield: el valor manual si lo hay, si no lo invertido. El valor
      // de MERCADO no se usa acá a propósito — esto corre en cada carga y no
      // puede depender de una llamada de precios que puede fallar o tardar.
      const invertido = Number(h.quantity ?? 0) * Number(h.average_cost ?? 0);
      const base = Number(h.current_value_manual ?? 0) || invertido;
      monthly = calcularRendimiento(
        {
          modo: (h.payout_mode as "yield" | "manual") ?? "yield",
          yieldPct: h.payout_rate_pct,
          montoPorPago: h.payout_amount,
          frecuencia: h.payout_frequency,
          retencionPct: h.payout_withholding_pct,
        },
        base,
      ).netoMensual;
    } else {
      const acc = divByHolding.get(h.id);
      if (!acc) continue;
      monthly = Math.round((acc.total / 12) * 100) / 100;
      currency = acc.currency;
    }

    if (monthly <= 0) continue;
    desired.push({
      type: "income",
      name: `Dividendos — ${nombre}`,
      amount: monthly,
      currency,
      categoryId: null,
      sourceKind: "dividend",
      sourceId: h.id,
    });
  }

  // Renta de inversiones de flujo de caja (Airbnb/alquiler/CDP/bono/negocio…):
  // proyección recurrente como ingreso derivado, mismo riel que dividendos.
  // La conciliación de pagos reales (Recibido) se hace en C-2b vía
  // transactions.income_source_id; aquí solo la línea proyectada (mensualizada).
  const { data: rentalHoldings } = await supabase
    .from("investment_holdings")
    .select(
      "id,label,symbol,currency,category,rental_income,rental_frequency,income_month,vacancy_pct,mgmt_pct,maintenance_monthly,hoa_monthly,property_tax_annual,insurance_annual,services_monthly,maturity_date",
    )
    .eq("user_id", user.id)
    .gt("rental_income", 0);
  for (const h of rentalHoldings ?? []) {
    // Inmueble de renta → ingreso recurrente MENSUAL, monto NETO operativo
    // (renta − vacancia − administración − costos fijos). Cae todos los meses.
    if (h.category === "propiedad_alquiler") {
      const gross = toMonthly(Number(h.rental_income), h.rental_frequency);
      if (gross <= 0) continue;
      const r01 = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
      const n = (v: unknown) => Number(v) || 0;
      const collected = gross * (1 - r01(h.vacancy_pct));
      const mgmt = collected * r01(h.mgmt_pct);
      const fixed =
        n(h.maintenance_monthly) +
        n(h.hoa_monthly) +
        n(h.services_monthly) +
        n(h.property_tax_annual) / 12 +
        n(h.insurance_annual) / 12;
      const net = collected - mgmt - fixed;
      if (net <= 0) continue;
      desired.push({
        type: "income",
        name: `Ingreso — ${h.label ?? h.symbol}`,
        amount: Math.round(net * 100) / 100,
        currency: h.currency,
        categoryId: null,
        sourceKind: "rental",
        sourceId: h.id,
      });
      continue;
    }

    // Bonos / CDP / préstamos: CALENDARIO por mes ancla. El monto es el PAGO
    // COMPLETO del periodo y aparece SOLO en los meses que toca (derivados de
    // income_month + frecuencia). Fuera de esos meses no hay línea → el diff la
    // elimina de ese periodo.
    const perPayment = Number(h.rental_income) || 0;
    if (perPayment <= 0) continue;
    // Al vencimiento: pago ÚNICO en el mes+año de vencimiento (no se repite).
    if (h.rental_frequency === "al_vencimiento") {
      if (!h.maturity_date) continue;
      const [my, mm] = String(h.maturity_date).split("-").map(Number);
      if (period.year !== my || period.month !== mm) continue;
      desired.push({
        type: "income",
        name: `Ingreso — ${h.label ?? h.symbol}`,
        amount: Math.round(perPayment * 100) / 100,
        currency: h.currency,
        categoryId: null,
        sourceKind: "rental",
        sourceId: h.id,
      });
      continue;
    }
    const anchor = ((((Number(h.income_month) || 1) - 1) % 12) + 12) % 12; // 0-11
    const paymentMonths: number[] | null =
      h.rental_frequency === "trimestral"
        ? [0, 3, 6, 9].map((k) => ((anchor + k) % 12) + 1)
        : h.rental_frequency === "semestral"
          ? [0, 6].map((k) => ((anchor + k) % 12) + 1)
          : h.rental_frequency === "anual"
            ? [anchor + 1]
            : null; // mensual (o sin frecuencia) → todos los meses
    if (paymentMonths && !paymentMonths.includes(period.month)) continue;

    // Semanal: ingreso todas las semanas → equivalente mensual (×52/12), todos
    // los meses. El resto usa el pago completo del periodo.
    const monthly = h.rental_frequency === "semanal" ? perPayment * (52 / 12) : perPayment;
    desired.push({
      type: "income",
      name: `Ingreso — ${h.label ?? h.symbol}`,
      amount: Math.round(monthly * 100) / 100,
      currency: h.currency,
      categoryId: null,
      sourceKind: "rental",
      sourceId: h.id,
    });
  }

  // Diff contra las líneas derivadas existentes del periodo.
  const { data: existingRows } = await supabase
    .from("budget_items")
    .select("id,type,name,amount,currency,category_id,source_kind,source_id")
    .eq("user_id", user.id)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .neq("source_kind", "manual");

  const existing: ExistingDerived[] = (existingRows ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    categoryId: r.category_id,
    sourceKind: r.source_kind,
    sourceId: r.source_id,
  }));

  const { toInsert, toUpdate, toDeleteIds } = diffDerived(existing, desired);

  if (toInsert.length > 0) {
    // household: las líneas derivadas comparten hogar igual que las manuales.
    const household_id = await getActiveHouseholdId(supabase, user.id);
    // Insert fila-por-fila: un batch atómico dropea TODAS las filas si una sola
    // viola una constraint (y el error se perdía). Fila-por-fila, una fila mala
    // se saltea y las buenas entran. El índice único 0023 evita duplicados si dos
    // syncs corren a la vez: 23505 = duplicado por carrera concurrente (la línea
    // ya existe), se ignora. Cualquier otro error se loguea y se sigue.
    for (const l of toInsert) {
      const { error } = await supabase.from("budget_items").insert({
        user_id: user.id,
        household_id,
        type: l.type,
        category_id: l.categoryId,
        name: l.name,
        amount: l.amount,
        currency: l.currency,
        frequency: "mensual",
        period_month: period.month,
        period_year: period.year,
        source_kind: l.sourceKind,
        source_id: l.sourceId,
      });
      if (error && error.code !== "23505") {
        console.error(
          `[syncDerivedBudget] insert de línea derivada falló ` +
            `(source_kind=${l.sourceKind}, source_id=${l.sourceId}, ` +
            `code=${error.code}): ${error.message}`,
        );
      }
    }
  }
  for (const u of toUpdate) {
    await supabase
      .from("budget_items")
      .update({
        type: u.line.type,
        name: u.line.name,
        amount: u.line.amount,
        currency: u.line.currency,
        category_id: u.line.categoryId,
      })
      .eq("id", u.id)
      .eq("user_id", user.id);
  }
  if (toDeleteIds.length > 0) {
    await supabase.from("budget_items").delete().in("id", toDeleteIds).eq("user_id", user.id);
  }

  // Conciliación de renta (C-2b): atribuye las transacciones de renta del
  // periodo (linked_kind='rental') a su línea derivada, llenando la barra
  // "Recibido". Solo toca las que aún no tienen income_source_id (idempotente),
  // así rellena tanto los pagos legado como cualquier rezagado. Best-effort.
  try {
    await relinkRentalReceipts(supabase, user.id, period);
  } catch {
    // noop — se reintenta en la próxima carga.
  }

  // Barrido cross-period (Parte 1C): el diff de arriba solo limpia el periodo
  // cargado. Esto borra líneas derivadas huérfanas (su entidad origen ya no
  // existe) en CUALQUIER periodo. Best-effort: no debe bloquear el sync.
  try {
    await sweepOrphanedDerived(supabase, user.id);
  } catch {
    // noop — se reintenta en la próxima carga.
  }
}

/**
 * Conciliación de renta (C-2b): por cada línea derivada de renta del periodo
 * (source_kind='rental', source_id=holdingId), enlaza las transacciones de
 * renta de ese holding ocurridas en el periodo que aún no apuntan a una fuente
 * (income_source_id is null). No pisa atribuciones existentes: es idempotente.
 */
async function relinkRentalReceipts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  period: Period,
): Promise<void> {
  const { data: rentalLines } = await supabase
    .from("budget_items")
    .select("id,source_id")
    .eq("user_id", userId)
    .eq("source_kind", "rental")
    .eq("period_month", period.month)
    .eq("period_year", period.year);
  for (const line of rentalLines ?? []) {
    if (!line.source_id) continue;
    await supabase
      .from("transactions")
      .update({ income_source_id: line.id })
      .eq("user_id", userId)
      .eq("linked_kind", "rental")
      .eq("linked_id", line.source_id)
      .is("income_source_id", null)
      .gte("occurred_on", period.from)
      .lte("occurred_on", period.to);
  }
}

const ORIGIN_TABLE = {
  debt: "debts",
  goal: "savings_goals",
  policy: "insurance_policies",
  recurring: "recurring_items",
  dividend: "investment_holdings",
  rental: "investment_holdings",
} as const;
type OriginTable = (typeof ORIGIN_TABLE)[keyof typeof ORIGIN_TABLE];

/**
 * Borra budget_items derivados (source_kind<>'manual') cuyo source_id ya no
 * existe en su tabla origen, en todos los periodos del usuario. Si la consulta
 * a la tabla origen falla, NO borra ese kind (evita borrados por error de RLS).
 */
async function sweepOrphanedDerived(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<void> {
  const { data: derived } = await supabase
    .from("budget_items")
    .select("id,source_kind,source_id")
    .eq("user_id", userId)
    .neq("source_kind", "manual")
    .not("source_id", "is", null);
  if (!derived || derived.length === 0) return;

  const byKind = new Map<string, Set<string>>();
  for (const r of derived) {
    if (!r.source_id) continue;
    const set = byKind.get(r.source_kind) ?? new Set<string>();
    set.add(r.source_id);
    byKind.set(r.source_kind, set);
  }

  const orphanIds: string[] = [];
  for (const [kind, ids] of byKind) {
    const table = ORIGIN_TABLE[kind as keyof typeof ORIGIN_TABLE] as OriginTable | undefined;
    if (!table) continue; // kind desconocido: no arriesgar borrado
    const { data: alive, error } = await supabase
      .from(table)
      .select("id")
      .eq("user_id", userId)
      .in("id", [...ids]);
    if (error) continue; // consulta fallida: no borrar este kind
    const aliveSet = new Set(((alive ?? []) as { id: string }[]).map((a) => a.id));
    for (const r of derived) {
      if (r.source_kind === kind && r.source_id && !aliveSet.has(r.source_id)) {
        orphanIds.push(r.id);
      }
    }
  }

  if (orphanIds.length > 0) {
    await supabase.from("budget_items").delete().in("id", orphanIds).eq("user_id", userId);
  }
}
