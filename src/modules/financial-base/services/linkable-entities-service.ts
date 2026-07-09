import "server-only";

/**
 * Opciones de entidades vinculables para el selector de 1 tap del composer
 * (Fase 2). Solo SELECTs ligeros (id + etiqueta) con RLS — la lógica de cada
 * entidad sigue viviendo en su módulo (control/wealth); leer referencias aquí
 * evita un ciclo de imports financial-base ↔ control/wealth.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type LinkableEntity = {
  id: string;
  name: string;
  kind: "debt" | "goal" | "holding" | "policy" | "rental";
};

export type LinkableEntities = {
  debt: LinkableEntity[];
  goal: LinkableEntity[];
  holding: LinkableEntity[];
  policy: LinkableEntity[];
  rental: LinkableEntity[];
};

/** Tabla que respalda cada linked_kind (rental vive en investment_holdings). */
export const LINKED_KIND_TABLE = {
  debt: "debts",
  goal: "savings_goals",
  holding: "investment_holdings",
  policy: "insurance_policies",
  rental: "investment_holdings",
} as const;

/** Mensaje en español por tipo cuando la entidad no existe o no es del usuario. */
export const LINKED_KIND_MISSING_MSG: Record<keyof typeof LINKED_KIND_TABLE, string> = {
  debt: "La deuda vinculada ya no existe o no te pertenece.",
  goal: "La meta vinculada ya no existe o no te pertenece.",
  holding: "La inversión vinculada ya no existe o no te pertenece.",
  policy: "La póliza vinculada ya no existe o no te pertenece.",
  rental: "El activo de renta vinculado ya no existe o no te pertenece.",
};

/**
 * Garantiza que la entidad vinculada existe Y pertenece al usuario (Fase 6.1).
 * linked_id es polimórfico sin FK: esta es LA validación. RLS ya filtra por
 * usuario, y además se exige user_id explícito — un id ajeno se comporta
 * igual que uno inexistente. Lanza con mensaje en español si no se encuentra.
 */
export async function assertLinkableEntity(
  kind: keyof typeof LINKED_KIND_TABLE,
  id: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(LINKED_KIND_TABLE[kind])
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(LINKED_KIND_MISSING_MSG[kind]);
}

export async function listLinkableEntities(): Promise<LinkableEntities> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [debts, goals, holdings, policies] = await Promise.all([
    supabase.from("debts").select("id,name").eq("user_id", user.id).order("created_at"),
    supabase.from("savings_goals").select("id,name").eq("user_id", user.id).order("created_at"),
    supabase
      .from("investment_holdings")
      .select("id,label,symbol,rental_subtype")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider")
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  const out: LinkableEntities = { debt: [], goal: [], holding: [], policy: [], rental: [] };
  for (const d of debts.data ?? []) out.debt.push({ id: d.id, name: d.name, kind: "debt" });
  for (const g of goals.data ?? []) out.goal.push({ id: g.id, name: g.name, kind: "goal" });
  for (const h of holdings.data ?? []) {
    const name = h.label ?? h.symbol;
    // Activos de renta (inmueble/Airbnb/auto/negocio) son vinculables como
    // 'rental'; el resto del portafolio como 'holding'.
    if (h.rental_subtype) out.rental.push({ id: h.id, name, kind: "rental" });
    else out.holding.push({ id: h.id, name, kind: "holding" });
  }
  for (const p of policies.data ?? []) {
    const name = [p.policy_type, p.provider].filter(Boolean).join(" — ") || "Póliza";
    out.policy.push({ id: p.id, name, kind: "policy" });
  }
  return out;
}

/** Entidad vinculable con monto + subtítulo (para los frascos de Gastos). */
export type DetailedEntity = {
  id: string;
  name: string;
  sub: string;
  amount: number;
  currency: string;
  kind: "debt" | "goal" | "holding" | "policy" | "rental";
};
export type DetailedEntities = {
  debt: DetailedEntity[];
  goal: DetailedEntity[];
  holding: DetailedEntity[];
  policy: DetailedEntity[];
  rental: DetailedEntity[];
};

/**
 * Como listLinkableEntities pero con el monto representativo de cada entidad
 * (cuota de deuda, aporte de meta, prima de póliza, valor de inversión) y un
 * subtítulo. SELECTs ligeros con RLS — sin importar control/wealth (sin ciclo).
 */
export async function listLinkableEntitiesDetailed(): Promise<DetailedEntities> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [debts, goals, holdings, policies] = await Promise.all([
    supabase
      .from("debts")
      .select("id,name,current_payment,min_payment,currency")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("savings_goals")
      .select("id,name,monthly_contribution,current_amount,target_amount,currency")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("investment_holdings")
      .select("id,label,symbol,quantity,average_cost,current_value_manual,rental_subtype,currency,monthly_contribution,is_recurring")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider,premium,premium_frequency,currency")
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  const out: DetailedEntities = { debt: [], goal: [], holding: [], policy: [], rental: [] };

  for (const d of debts.data ?? []) {
    const cuota =
      Number(d.current_payment) > 0 ? Number(d.current_payment) : Number(d.min_payment ?? 0);
    out.debt.push({
      id: d.id,
      name: d.name,
      sub: "Cuota mensual",
      amount: cuota,
      currency: d.currency,
      kind: "debt",
    });
  }
  for (const g of goals.data ?? []) {
    const sub = `${Math.round((Number(g.target_amount) > 0 ? Number(g.current_amount) / Number(g.target_amount) : 0) * 100)}% · aporte mensual`;
    out.goal.push({
      id: g.id,
      name: g.name,
      sub,
      amount: Number(g.monthly_contribution ?? 0),
      currency: g.currency,
      kind: "goal",
    });
  }
  for (const h of holdings.data ?? []) {
    const name = h.label ?? h.symbol;
    const value =
      h.current_value_manual != null
        ? Number(h.current_value_manual)
        : Number(h.quantity) * Number(h.average_cost);
    if (h.rental_subtype) {
      out.rental.push({
        id: h.id,
        name,
        sub: String(h.rental_subtype),
        amount: value,
        currency: h.currency,
        kind: "rental",
      });
    } else {
      const aporte = h.is_recurring ? Number(h.monthly_contribution ?? 0) : 0;
      out.holding.push({
        id: h.id,
        name,
        sub: h.is_recurring ? "aporte mensual" : (h.symbol ?? "Inversión"),
        amount: aporte,
        currency: h.currency,
        kind: "holding",
      });
    }
  }
  for (const p of policies.data ?? []) {
    const name = [p.policy_type, p.provider].filter(Boolean).join(" — ") || "Póliza";
    out.policy.push({
      id: p.id,
      name,
      sub: p.premium_frequency ? `Prima ${p.premium_frequency}` : "Prima",
      amount: Number(p.premium ?? 0),
      currency: p.currency,
      kind: "policy",
    });
  }
  return out;
}
