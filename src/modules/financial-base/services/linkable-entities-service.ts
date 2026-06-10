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
