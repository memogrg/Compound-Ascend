import "server-only";

/**
 * Compuerta OTP propia para el borrado de cuenta (#82). Los flujos nativos de
 * Supabase no gatean en esta config (ver migración 20260901000002). El código se
 * genera y verifica en el server: se guarda solo su HASH (sha256), con TTL y tope
 * de intentos, y se consume al verificar. Se entrega por correo (sendEmail).
 */
import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/send";

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

function adminDb(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient;
}
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Genera un OTP de 6 dígitos, guarda su hash con TTL y lo envía por correo. */
export async function issueDeletionOtp(
  userId: string,
  email: string,
): Promise<{ ok: boolean; skippedEmail?: boolean }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const db = adminDb();
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
  const { error } = await db
    .from("account_deletion_otps")
    .upsert(
      { user_id: userId, code_hash: hash(code), expires_at: expires, attempts: 0 },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false };

  const res = await sendEmail({
    to: email,
    subject: `${code} es tu código para borrar tu cuenta`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">
      <p>Recibimos una solicitud para <strong>borrar tu cuenta de CARTERA+</strong>.</p>
      <p>Tu código de confirmación es:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</p>
      <p>Vence en ${OTP_TTL_MIN} minutos. Si no fuiste vos, ignorá este correo: tu cuenta no se tocará.</p>
    </div>`,
  });
  return { ok: true, skippedEmail: res.skipped === true };
}

/** Verifica el OTP: hash + TTL + intentos. Lo consume (borra) si acierta. */
export async function verifyDeletionOtp(userId: string, code: string): Promise<boolean> {
  const db = adminDb();
  const { data: row } = await db
    .from("account_deletion_otps")
    .select("code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from("account_deletion_otps").delete().eq("user_id", userId);
    return false;
  }
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
    await db.from("account_deletion_otps").delete().eq("user_id", userId);
    return false;
  }
  if (row.code_hash !== hash(code.trim())) {
    await db
      .from("account_deletion_otps")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("user_id", userId);
    return false;
  }
  await db.from("account_deletion_otps").delete().eq("user_id", userId); // consumido
  return true;
}
