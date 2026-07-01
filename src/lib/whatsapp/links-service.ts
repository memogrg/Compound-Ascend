import "server-only";

/**
 * Vínculos WhatsApp<->usuario por OTP.
 *
 * - Funciones de APP (sesión, respetan RLS): generar OTP, leer estado, revocar.
 * - Funciones de WEBHOOK (service-role, omiten RLS): resolver número activo,
 *   activar por OTP, marcar last_seen. El service-role SOLO se usa server-side y
 *   tras verificar el OTP (nunca asociamos por número sin verificación).
 */
import { randomInt } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { getActiveHouseholdId } from "@/lib/household/active";
import type { WhatsAppLinkStatus } from "@/lib/supabase/database.types";

const OTP_TTL_MIN = 10;

// ---------- APP (sesión, RLS) ----------

export type MyLink = { status: WhatsAppLinkStatus; phone: string | null } | null;

/** Estado del vínculo del usuario actual (para la UI de Ajustes). */
export async function getMyLink(): Promise<MyLink> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("whatsapp_links")
    .select("status, phone_e164")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { status: data.status, phone: data.phone_e164 };
}

export type GeneratedOtp = { otp: string; botNumber: string | null; expiresInMin: number };

/** Genera un OTP de 6 dígitos (10 min) y deja el vínculo en `pending`. */
export async function generateLinkOtp(): Promise<GeneratedOtp> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const otp = String(randomInt(100000, 1000000));
  const otp_expires_at = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();

  // Upsert por user_id: no tocamos phone_e164 (se fija al verificar).
  await supabase
    .from("whatsapp_links")
    .upsert(
      { user_id: user.id, household_id, status: "pending", otp_code: otp, otp_expires_at },
      { onConflict: "user_id" },
    );

  return {
    otp,
    botNumber: getServerEnv().TWILIO_WHATSAPP_NUMBER ?? null,
    expiresInMin: OTP_TTL_MIN,
  };
}

/** Desvincula el WhatsApp del usuario actual. */
export async function revokeLink(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("whatsapp_links")
    .update({ status: "revoked", otp_code: null, otp_expires_at: null })
    .eq("user_id", user.id);
}

// ---------- WEBHOOK (service-role) ----------

export type ActiveLink = {
  id: string;
  userId: string;
  householdId: string | null;
  phone: string;
};

/** Propuesta de transacción pendiente de confirmación (foto, texto o propuesta de
 *  ingesta por banco). proposalId/cardLabel solo vienen de la cola ingest_proposals. */
export type PendingAction = {
  kind: "gasto" | "ingreso";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchant?: string | null;
  origin: "scanned" | "ai_assisted" | "manual" | "notification" | "imported";
  source: "receipt" | "chat" | "notification" | "email";
  proposalId?: string; // fila de ingest_proposals que originó la propuesta
  cardLabel?: string | null; // etiqueta de tarjeta resuelta (último-4 → nombre)
};

/** Meta de ahorro propuesta por la IA, pendiente de confirmación (discriminada por `type`). */
export type GoalPending = {
  type: "goal";
  name: string;
  targetAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate?: string | null; // YYYY-MM-DD
};

/**
 * Confirmación pendiente almacenada en el vínculo: transacción (sin `type`, forma histórica) o
 * meta (`type:"goal"`). El discriminador `type` distingue el camino de confirmación.
 */
export type StoredPending = PendingAction | GoalPending;

/** Moneda principal del usuario (default CRC). */
export async function getUserCurrency(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("user_settings")
    .select("primary_currency")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.primary_currency ?? "CRC";
}

/** Guarda/limpia la confirmación pendiente del vínculo. */
export async function setPendingAction(
  linkId: string,
  action: StoredPending | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("whatsapp_links").update({ pending_action: action }).eq("id", linkId);
}

export async function getPendingAction(linkId: string): Promise<StoredPending | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("whatsapp_links")
    .select("pending_action")
    .eq("id", linkId)
    .maybeSingle();
  return (data?.pending_action as StoredPending | null) ?? null;
}

/** Vínculo activo por número (E.164). Devuelve null si no está vinculado. */
export async function getActiveLinkByPhone(phone: string): Promise<ActiveLink | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("whatsapp_links")
    .select("id, user_id, household_id, phone_e164")
    .eq("phone_e164", phone)
    .eq("status", "active")
    .maybeSingle();
  if (!data || !data.phone_e164) return null;
  return {
    id: data.id,
    userId: data.user_id,
    householdId: data.household_id,
    phone: data.phone_e164,
  };
}

/** Nombre del usuario (para saludarlo al confirmar el vínculo). */
export async function getUserDisplayName(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name ?? "";
}

/** Marca actividad reciente (no registra contenido). */
export async function touchLastSeen(linkId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("whatsapp_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", linkId);
}

export type ActivateResult =
  | { ok: true; userId: string; householdId: string | null }
  | { ok: false; reason: "invalid" | "phone_taken" };

/**
 * Activa un vínculo `pending` cuyo OTP coincide y no expiró, ligándolo al número
 * remitente. Rechaza si el número ya pertenece a otro usuario activo.
 */
export async function activateLinkByOtp(phone: string, code: string): Promise<ActivateResult> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows } = await supabase
    .from("whatsapp_links")
    .select("id, user_id, household_id")
    .eq("otp_code", code)
    .eq("status", "pending")
    .gt("otp_expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1);
  const pending = rows?.[0];
  if (!pending) return { ok: false, reason: "invalid" };

  // ¿El número ya está activo para otro usuario?
  const { data: taken } = await supabase
    .from("whatsapp_links")
    .select("user_id")
    .eq("phone_e164", phone)
    .eq("status", "active")
    .maybeSingle();
  if (taken && taken.user_id !== pending.user_id) return { ok: false, reason: "phone_taken" };

  const { error } = await supabase
    .from("whatsapp_links")
    .update({
      phone_e164: phone,
      status: "active",
      verified_at: nowIso,
      last_seen_at: nowIso,
      otp_code: null,
      otp_expires_at: null,
    })
    .eq("id", pending.id);
  if (error) return { ok: false, reason: "phone_taken" };

  return { ok: true, userId: pending.user_id, householdId: pending.household_id };
}
