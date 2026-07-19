import "server-only";

/**
 * Onboarding self-serve de la ingesta por correo: el usuario registra el correo
 * donde recibe avisos del banco (forwarder_email) y prueba la propiedad con un
 * código de 6 dígitos enviado a ESA dirección (mismo espíritu que el OTP de
 * WhatsApp). El poller solo procesa filas verified=true.
 *
 * Lecturas/escrituras con cliente de SESIÓN → respetan RLS (el dueño gestiona sus
 * propias filas). El código se guarda HASHEADO (sha256), nunca en claro.
 */
import { randomInt, createHash } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveHouseholdId, householdMemberIds } from "@/lib/household/active";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";

const VERIFY_TTL_MIN = 15;
const emailSchema = z.string().trim().toLowerCase().email();

export type IngestEmailResult = { ok: boolean; message?: string };
export type IngestEmailRow = {
  id: string;
  forwarderEmail: string;
  verified: boolean;
  createdAt: string;
};

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Correos de ingesta del usuario (forwarder, estado de verificación). */
export async function listMyIngestEmails(): Promise<IngestEmailRow[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("email_ingest_links")
    .select("id, forwarder_email, verified, created_at")
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .filter((r): r is typeof r & { forwarder_email: string } => Boolean(r.forwarder_email))
    .map((r) => ({
      id: r.id,
      forwarderEmail: r.forwarder_email,
      verified: r.verified,
      createdAt: r.created_at,
    }));
}

/**
 * Genera un código de 6 dígitos (15 min), guarda su hash en una fila pending
 * (verified=false) y lo envía a la dirección. Idempotente por forwarder_email
 * (re-pedir reemplaza el código). Requiere email configurado.
 */
export async function requestIngestEmailVerification(rawEmail: string): Promise<IngestEmailResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: "Ingresá un correo válido." };
  if (!isEmailConfigured()) {
    return { ok: false, message: "El envío de correo no está configurado todavía." };
  }
  const email = parsed.data;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);

  const code = String(randomInt(100000, 1000000));
  const verify_expires_at = new Date(Date.now() + VERIFY_TTL_MIN * 60_000).toISOString();

  // Upsert por forwarder_email (único): re-pedir el código actualiza la misma fila.
  // Si el correo ya pertenece a otra cuenta, RLS bloquea el update → error claro.
  const { error } = await supabase.from("email_ingest_links").upsert(
    {
      user_id: user.id,
      household_id,
      forwarder_email: email,
      verified: false,
      verify_code_hash: hashCode(code),
      verify_expires_at,
    },
    { onConflict: "forwarder_email" },
  );
  if (error) {
    logger.warn("ingest-email: fallo al guardar la solicitud", { message: error.message });
    return { ok: false, message: "Ese correo no está disponible o no pudimos guardarlo." };
  }

  const res = await sendEmail({
    to: email,
    subject: "CARTERA+ · Verificá tu correo de ingesta",
    html:
      `<p>Hola,</p>` +
      `<p>Usá este código para verificar <strong>${email}</strong> como tu correo de avisos del banco en CARTERA+:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>` +
      `<p>Vence en ${VERIFY_TTL_MIN} minutos. Si no fuiste vos, ignorá este mensaje.</p>` +
      `<p>— CARTERA+</p>`,
  });
  if (!res.ok) {
    return { ok: false, message: "No pudimos enviar el código. Probá de nuevo en un momento." };
  }
  return { ok: true };
}

/**
 * Confirma el correo: compara el hash y la vigencia; si ok → verified=true y limpia
 * el código. La verificación corre en la action (no por RLS directa); ver la nota de
 * hardening en la migración 0031.
 */
export async function confirmIngestEmail(rawEmail: string, code: string): Promise<IngestEmailResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: "Ingresá un correo válido." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("email_ingest_links")
    .select("id, verified, verify_code_hash, verify_expires_at")
    .eq("user_id", user.id)
    .eq("forwarder_email", parsed.data)
    .maybeSingle();
  if (!row) return { ok: false, message: "No encontramos ese correo. Pedí el código primero." };
  if (row.verified) return { ok: true }; // ya verificado: idempotente

  if (!row.verify_code_hash || !row.verify_expires_at || new Date(row.verify_expires_at) < new Date()) {
    return { ok: false, message: "El código venció. Pedí uno nuevo." };
  }
  if (row.verify_code_hash !== hashCode(code.trim())) {
    return { ok: false, message: "Código incorrecto." };
  }

  const { error } = await supabase
    .from("email_ingest_links")
    .update({ verified: true, verify_code_hash: null, verify_expires_at: null })
    .eq("id", row.id);
  if (error) return { ok: false, message: "No pudimos confirmar. Probá de nuevo." };
  return { ok: true };
}

/** Elimina un correo de ingesta del usuario (RLS: solo las filas propias). */
export async function removeIngestEmail(id: string): Promise<IngestEmailResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("email_ingest_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, message: "No pudimos eliminar el correo." };
  return { ok: true };
}
