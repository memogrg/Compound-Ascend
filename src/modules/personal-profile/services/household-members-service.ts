import "server-only";

/**
 * Gestión de miembros del hogar (pantalla de Configuración): listar, invitar con
 * límite por plan, revocar invitaciones y remover miembros. Respeta RLS; el email
 * de cada miembro se resuelve vía la función SECURITY DEFINER list_household_members
 * (profiles no expone el email de otros).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { isActiveHouseholdEditor } from "@/lib/household/active";
import { householdMemberLimit, type Plan } from "@/lib/plan";

export type HouseholdMemberView = {
  userId: string;
  email: string;
  role: string;
  status: string;
  isSelf: boolean;
  isOwner: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

export type HouseholdQuota = {
  limit: number;
  usedActive: number;
  usedPending: number;
  remaining: number;
  /** El hogar ya supera el límite del plan (miembros previos a bajar de plan). */
  overLimit: boolean;
};

export type HouseholdMembersView = {
  /** ¿Puede el usuario gestionar (invitar/revocar/remover)? owner/adult. */
  canManage: boolean;
  /** ¿Es el owner del hogar? (única persona que puede remover miembros). */
  isOwner: boolean;
  members: HouseholdMemberView[];
  pending: PendingInvitation[];
  quota: HouseholdQuota;
};

async function getPlan(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string): Promise<Plan> {
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return (data?.plan ?? "free") as Plan;
}

/**
 * Vista completa de miembros para Configuración. Los miembros activos salen de la
 * función SECURITY DEFINER (con email); las invitaciones pendientes de
 * household_invitations (RLS: las ve un editor). El cupo cuenta ACTIVOS +
 * PENDIENTES, para no invitar de más y pasarse al aceptar.
 */
export async function listHouseholdMembers(): Promise<HouseholdMembersView> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, canManage, plan] = await Promise.all([
    supabase.rpc("list_household_members"),
    isActiveHouseholdEditor(supabase, user.id),
    getPlan(supabase, user.id),
  ]);

  const members: HouseholdMemberView[] = (rows ?? []).map((m) => ({
    userId: m.user_id,
    email: m.email,
    role: m.role,
    status: m.status,
    isSelf: m.user_id === user.id,
    isOwner: m.role === "owner",
  }));

  // Invitaciones pendientes (RLS: is_household_editor). Vacío si no es editor.
  let pending: PendingInvitation[] = [];
  if (canManage) {
    const { data: inv } = await supabase
      .from("household_invitations")
      .select("id,email,created_at,expires_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    pending = (inv ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
    }));
  }

  const limit = householdMemberLimit(plan);
  const usedActive = members.filter((m) => m.status === "active").length;
  const usedPending = pending.length;
  const remaining = Math.max(0, limit - usedActive - usedPending);

  return {
    canManage,
    isOwner: members.some((m) => m.isSelf && m.isOwner),
    members,
    pending,
    quota: {
      limit,
      usedActive,
      usedPending,
      remaining,
      overLimit: usedActive + usedPending > limit,
    },
  };
}

/** ¿Hay cupo para una invitación más? (activos + pendientes < límite del plan). */
export async function hasHouseholdInviteCapacity(): Promise<{ ok: boolean; limit: number }> {
  const view = await listHouseholdMembers();
  return { ok: view.quota.remaining > 0, limit: view.quota.limit };
}

/** Revoca una invitación pendiente (status='revoked'). Solo un editor del hogar. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  if (!(await isActiveHouseholdEditor(supabase, user.id))) {
    throw new Error("Solo un editor del hogar puede revocar invitaciones.");
  }
  // RLS (is_household_editor) es el candado; el filtro por pending evita tocar
  // aceptadas/revocadas. update, no delete: queda el rastro.
  const { error } = await supabase
    .from("household_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

/**
 * Remueve a un miembro del hogar: status='removed' (NO borra la fila, queda
 * rastro). Reglas duras: solo el OWNER puede; no se puede remover al owner ni a
 * uno mismo. El ex-miembro pierde acceso al hogar (el RLS deja de matchear); las
 * filas que él creó siguen siendo suyas (revocación total = decisión aparte).
 */
export async function removeHouseholdMember(targetUserId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (targetUserId === user.id) {
    throw new Error("No podés removerte a vos mismo desde acá.");
  }

  // Solo el owner remueve. Resuelve el hogar y el rol del que llama en una lectura.
  const { data: me } = await supabase
    .from("household_members")
    .select("household_id,role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const mine = (me ?? []).find((m) => m.role === "owner") ?? (me ?? [])[0];
  if (!mine || mine.role !== "owner") {
    throw new Error("Solo el titular del hogar puede quitar miembros.");
  }

  const { data: target } = await supabase
    .from("household_members")
    .select("role,status")
    .eq("household_id", mine.household_id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target || target.status !== "active") {
    throw new Error("Ese miembro no está en tu hogar.");
  }
  if (target.role === "owner") {
    throw new Error("No se puede quitar al titular del hogar.");
  }

  const { error } = await supabase
    .from("household_members")
    .update({ status: "removed" })
    .eq("household_id", mine.household_id)
    .eq("user_id", targetUserId);
  if (error) throw new Error(error.message);

  // Revocación TOTAL: reasigna al titular las filas financieras que el removido
  // creó (si no, las seguiría viendo por `user_id = auth.uid()`). Best-effort:
  // el miembro YA quedó fuera del hogar; si la reasignación falla, se puede
  // reintentar, pero no debe revertir la baja. Las tablas PERSONALES no se tocan.
  const { error: reErr } = await supabase.rpc("reassign_removed_member_rows", {
    p_removed_user: targetUserId,
  });
  if (reErr) {
    console.warn(`[remove-member] reasignación de filas falló: ${reErr.message}`);
  }
}
