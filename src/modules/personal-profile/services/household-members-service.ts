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

/**
 * Plan que define el CUPO: el que paga el TITULAR del hogar activo, no el de quien mira ni el
 * plan efectivo (un adult de un hogar Max+ ve el cupo de Max+; un titular Pro+ que además es
 * miembro de un hogar Max+ ajeno ve el de Pro+). Lo resuelve `household_owner_plan`, porque con
 * la sesión no se puede leer el `profiles.plan` del titular.
 */
async function getQuotaPlan(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<Plan> {
  const { data, error } = await supabase.rpc("household_owner_plan");
  // Si la RPC falla, el cupo mínimo: ante la duda no se invita de más.
  if (error) return "ninguno";
  if (data) return data as Plan;
  // Sin hogar activo todavía (primera invitación): ensure_household lo va a crear con esta
  // persona como titular, así que el cupo es el de su propio plan. CAPACIDAD, no acceso: por
  // eso esta lectura está en la lista de permitidos del guard de plan.
  const { data: own } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  return (own?.plan ?? "ninguno") as Plan;
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
    getQuotaPlan(supabase, user.id),
  ]);

  const members: HouseholdMemberView[] = (rows ?? []).map((m) => ({
    userId: m.user_id,
    email: m.email,
    role: m.role,
    status: m.status,
    isSelf: m.user_id === user.id,
    isOwner: m.role === "owner",
  }));

  // Invitaciones pendientes (RLS: is_household_editor). Vacío si no es editor. Las vencidas
  // no ocupan cupo: su enlace ya no sirve.
  let pending: PendingInvitation[] = [];
  if (canManage) {
    const { data: inv } = await supabase
      .from("household_invitations")
      .select("id,email,created_at,expires_at")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    pending = (inv ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
    }));
  }

  const limit = householdMemberLimit(plan);
  // Quien mira siempre ocupa un lugar: sin hogar todavía la lista viene vacía, pero al invitar
  // pasa a ser el titular. Sin esto, un Pro+ solo veía 1 cupo libre con un límite de 1.
  const usedActive = Math.max(1, members.filter((m) => m.status === "active").length);
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

/**
 * ¿Hay cupo para invitar a `emails`? Disponibles = límite del plan del titular −
 * (activos + pendientes no vencidas). Los correos que ya tienen una invitación pendiente no
 * cuentan: se reenvía la misma. `canManage` es false solo si tiene hogar activo y su rol no
 * es owner/adult (sin hogar, `isActiveHouseholdEditor` da true: va a ser el titular).
 */
export async function hasHouseholdInviteCapacity(emails: string[]): Promise<{
  ok: boolean;
  canManage: boolean;
  limit: number;
  remaining: number;
}> {
  const view = await listHouseholdMembers();
  const pendientes = new Set(view.pending.map((p) => p.email.toLowerCase()));
  const nuevos = new Set(emails.map((e) => e.toLowerCase()).filter((e) => !pendientes.has(e)));
  return {
    ok: view.canManage && nuevos.size <= view.quota.remaining,
    canManage: view.canManage,
    limit: view.quota.limit,
    remaining: view.quota.remaining,
  };
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
