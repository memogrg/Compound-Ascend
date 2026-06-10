import "server-only";

/**
 * syncDerivedBudget (Fase 3 · interconexión): genera/actualiza las líneas de
 * presupuesto derivadas de entidades para un periodo:
 *   · deudas activas        → gasto "Pago — {deuda}"        (source_kind 'debt')
 *   · metas con aporte      → gasto "Aporte — {meta}"       (source_kind 'goal')
 *   · pólizas con prima     → gasto "Prima — {seguro}"      (source_kind 'policy')
 *   · recurrentes activos   → ingreso/gasto según su kind   (source_kind 'recurring')
 *   · dividendos (12 meses) → ingreso "Dividendos — {pos.}" (source_kind 'dividend')
 *
 * Las líneas derivadas se editan en su entidad (candado en la UI); las
 * manuales no se tocan. Lecturas: SELECTs ligeros con RLS (mismo criterio que
 * linkable-entities-service para no acoplar módulos). El diff es puro
 * (engine/derived-budget) y el índice único 0023 hace el sync idempotente.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  diffDerived,
  toMonthly,
  type DesiredLine,
  type ExistingDerived,
} from "@/modules/financial-base/engine/derived-budget";
import { getSystemCategoryId } from "@/modules/financial-base/services/linked-transaction-service";
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

  const twelveMonthsAgo = new Date(period.year, period.month - 13, 1)
    .toISOString()
    .slice(0, 10);

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

  // Dividendos: promedio mensual de lo recibido en 12 meses, por posición.
  const divByHolding = new Map<string, { total: number; currency: string }>();
  for (const dv of divs.data ?? []) {
    const acc = divByHolding.get(dv.holding_id) ?? { total: 0, currency: dv.currency };
    acc.total += Number(dv.amount);
    divByHolding.set(dv.holding_id, acc);
  }
  if (divByHolding.size > 0) {
    const ids = [...divByHolding.keys()];
    const { data: holdings } = await supabase
      .from("investment_holdings")
      .select("id,label,symbol")
      .eq("user_id", user.id)
      .in("id", ids);
    const nameById = new Map((holdings ?? []).map((h) => [h.id, h.label ?? h.symbol]));
    for (const [holdingId, acc] of divByHolding) {
      const monthly = Math.round((acc.total / 12) * 100) / 100;
      if (monthly <= 0) continue;
      desired.push({
        type: "income",
        name: `Dividendos — ${nameById.get(holdingId) ?? "posición"}`,
        amount: monthly,
        currency: acc.currency,
        categoryId: null,
        sourceKind: "dividend",
        sourceId: holdingId,
      });
    }
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
    // El índice único 0023 evita duplicados si dos syncs corren a la vez;
    // la carrera perdedora recibe 23505 y se ignora (la línea ya existe).
    const { error } = await supabase.from("budget_items").insert(
      toInsert.map((l) => ({
        user_id: user.id,
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
      })),
    );
    if (error && error.code !== "23505") throw new Error(error.message);
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
}
