import "server-only";

/**
 * Onboarding self-serve de la ingesta por correo: el usuario registra el correo
 * donde recibe avisos del banco (forwarder_email) y prueba la propiedad con un
 * código de 6 dígitos enviado a ESA dirección (mismo espíritu que el OTP de
 * borrado de cuenta). El poller solo procesa filas verified=true.
 *
 * POR QUÉ ESCRIBE CON SERVICE-ROLE (excepción consciente a la regla de la casa):
 * la tabla ya no tiene grant de INSERT/UPDATE para anon/authenticated (migración
 * 20260902000001). Tenía que ser así: con grant, cualquier usuario logueado podía
 * escribir por PostgREST `{forwarder_email: "victima@…", verified: true}` y
 * quedarse con el correo de otro. Y no se puede resolver con un RPC security
 * definer, porque el código tiene que viajar SOLO por correo: una función que se
 * lo devolviera al llamador no probaría nada.
 *
 * Las garantías las pone este archivo, no la RLS:
 *   · requireUser() autentica; user_id se toma de la sesión, NUNCA del cliente.
 *   · una dirección ya registrada por otra cuenta se rechaza sin revelar de quién es.
 *   · `verified` solo pasa a true tras comparar el hash del código, en tiempo constante.
 *   · rate limit por dirección y por usuario: la app no se puede usar para
 *     bombardear correos ajenos con nuestra marca.
 * La LECTURA y el BORRADO siguen con cliente de sesión → RLS de verdad.
 */
import { randomInt, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getActiveHouseholdId,
  householdMemberIds,
  householdWriteScope,
} from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const VERIFY_TTL_MIN = 30;
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

/** Compara dos hashes hex en tiempo constante (no filtra el prefijo correcto). */
function sameHash(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
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
 * Genera un código de 6 dígitos, guarda su hash en una fila pendiente
 * (verified=false) y lo envía a la dirección. Re-pedirlo reemplaza el código.
 * Una dirección que ya pertenece a otra cuenta se rechaza.
 */
export async function requestIngestEmailVerification(rawEmail: string): Promise<IngestEmailResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: "Ingresá un correo válido." };
  if (!isEmailConfigured()) {
    return { ok: false, message: "El envío de correo no está configurado todavía." };
  }
  const email = parsed.data;
  const user = await requireUser();

  // Dos techos: uno por dirección (nadie usa la app para bombardear un correo
  // ajeno) y uno por usuario (nadie la usa para bombardear muchos).
  const perAddress = await rateLimit(`ingest-email:addr:${email}`, RATE_LIMITS.ingestEmailAddress);
  const perUser = await rateLimit(`ingest-email:user:${user.id}`, RATE_LIMITS.ingestEmailUser);
  if (!perAddress.ok || !perUser.ok) {
    return { ok: false, message: "Pediste varios códigos seguidos. Esperá unos minutos." };
  }

  const sessionDb = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(sessionDb, user.id);
  const admin = createServiceRoleClient();

  // ¿La dirección ya está tomada? El índice único es por forwarder_email, así que
  // la fila puede ser de otra cuenta: se rechaza sin decir de quién es.
  const { data: existing } = await admin
    .from("email_ingest_links")
    .select("id, user_id, verified")
    .eq("forwarder_email", email)
    .maybeSingle();
  if (existing && existing.user_id !== user.id) {
    logger.warn("ingest-email: intento de registrar una dirección de otra cuenta", {
      userId: user.id,
    });
    return {
      ok: false,
      message: "Ese correo ya está registrado en otra cuenta. Escribinos si es tuyo.",
    };
  }
  if (existing?.verified) return { ok: true }; // ya verificado por este usuario: nada que hacer

  const code = String(randomInt(100000, 1000000));
  const patch = {
    user_id: user.id,
    household_id,
    created_by: user.id,
    last_edited_by: user.id,
    forwarder_email: email,
    verified: false,
    verified_at: null,
    verify_code_hash: hashCode(code),
    verify_expires_at: new Date(Date.now() + VERIFY_TTL_MIN * 60_000).toISOString(),
  };
  const { error } = existing
    ? await admin.from("email_ingest_links").update(patch).eq("id", existing.id)
    : await admin.from("email_ingest_links").insert(patch);
  if (error) {
    logger.warn("ingest-email: fallo al guardar la solicitud", { message: error.message });
    return { ok: false, message: "No pudimos guardar ese correo. Probá de nuevo." };
  }

  const res = await sendEmail({
    to: email,
    subject: "CARTERA+ · Verificá tu correo de ingesta",
    html:
      `<p>Hola,</p>` +
      `<p>Usá este código para verificar <strong>${email}</strong> como tu correo de avisos del banco en CARTERA+:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>` +
      `<p>Vence en ${VERIFY_TTL_MIN} minutos. Si no fuiste vos, ignorá este mensaje: sin el código nadie puede conectar tu correo.</p>` +
      `<p>— CARTERA+</p>`,
  });
  if (!res.ok) {
    return { ok: false, message: "No pudimos enviar el código. Probá de nuevo en un momento." };
  }
  return { ok: true };
}

/**
 * Confirma el correo: compara el hash y la vigencia; si ok → verified=true,
 * sella verified_at y limpia el código. Es el ÚNICO lugar donde `verified` pasa
 * a true.
 */
export async function confirmIngestEmail(
  rawEmail: string,
  code: string,
): Promise<IngestEmailResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: "Ingresá un correo válido." };
  const user = await requireUser();

  // Techo de intentos: 6 dígitos se adivinan a fuerza bruta si se deja intentar.
  const rl = await rateLimit(`ingest-email:confirm:${user.id}`, RATE_LIMITS.ingestEmailConfirm);
  if (!rl.ok) return { ok: false, message: "Demasiados intentos. Esperá unos minutos." };

  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from("email_ingest_links")
    .select("id, user_id, verified, verify_code_hash, verify_expires_at")
    .eq("forwarder_email", parsed.data)
    .maybeSingle();

  // La fila tiene que ser de quien confirma. Mismo mensaje que "no existe": no se
  // revela que la dirección está registrada en otra cuenta.
  if (!row || row.user_id !== user.id) {
    return { ok: false, message: "No encontramos ese correo. Pedí el código primero." };
  }
  if (row.verified) return { ok: true }; // idempotente

  if (!row.verify_expires_at || new Date(row.verify_expires_at) < new Date()) {
    return { ok: false, message: "El código venció. Pedí uno nuevo." };
  }
  if (!sameHash(row.verify_code_hash, hashCode(code.trim()))) {
    return { ok: false, message: "Código incorrecto." };
  }

  const { error } = await admin
    .from("email_ingest_links")
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verify_code_hash: null,
      verify_expires_at: null,
      last_edited_by: user.id,
    })
    .eq("id", row.id);
  if (error) return { ok: false, message: "No pudimos confirmar. Probá de nuevo." };
  return { ok: true };
}

/** Elimina un correo de ingesta del usuario (cliente de sesión → RLS: solo las filas propias). */
export async function removeIngestEmail(id: string): Promise<IngestEmailResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase
    .from("email_ingest_links")
    .delete()
    .eq("id", id)
    .in("user_id", scope);
  if (error) return { ok: false, message: "No pudimos eliminar el correo." };
  await logHouseholdDeletion(supabase, { userId: user.id, table: "email_ingest_links", rowId: id });
  return { ok: true };
}
