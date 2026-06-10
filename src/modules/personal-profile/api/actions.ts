"use server";

/**
 * Server Actions del Setup Wizard (Módulo 1).
 * Validan con Zod y persisten respetando RLS. Si Supabase aún no está
 * configurado (dev), no persisten pero devuelven el diagnóstico calculado para
 * no bloquear la experiencia.
 */
import { revalidatePath } from "next/cache";
import { profileDraftSchema } from "@/modules/personal-profile/schemas";
import { saveDraft, completeProfile } from "@/modules/personal-profile/services/profile-service";
import {
  seedDemoTemplate,
  markOnboardingStarted,
} from "@/modules/personal-profile/services/demo-template";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { getClientEnv } from "@/lib/env";
import { z } from "zod";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { logger } from "@/lib/logger";

export type SaveResult = { ok: boolean };
export type StartResult = { ok: boolean; message?: string };

/** Opción "Crear ejemplo y editarlo": siembra la plantilla demo del usuario. */
export async function startWithDemoAction(): Promise<StartResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para usar la plantilla de ejemplo." };
  }
  try {
    await seedDemoTemplate();
    revalidatePath("/dashboard");
    revalidatePath("/mi-base-financiera");
    revalidatePath("/control-financiero");
    revalidatePath("/patrimonio");
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("startWithDemo fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos crear el ejemplo. Inténtalo de nuevo." };
  }
}

/** Opción "Quiero cargarlo manualmente": marca el onboarding y va al panel. */
export async function startManualAction(): Promise<StartResult> {
  if (!isSupabaseConfigured()) return { ok: true };
  try {
    await markOnboardingStarted();
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: true }; // no bloqueamos la navegación
  }
}
export type CompleteResult = { ok: boolean; diagnosis: ProfileDiagnosis; persisted: boolean };

const inviteSchema = z.array(z.string().trim().email().max(120)).min(1).max(4);

export type InviteResult = { ok: boolean; sent: number; configured: boolean; message: string };

/**
 * Invita a miembros al MISMO hogar del invitador. Asegura que el invitador tenga
 * un hogar (lo crea como `owner` si no existe), inserta una fila por correo en
 * `household_invitations` con un token y envía el correo con un enlace a
 * `/invitacion/aceptar?token=...`. Si el email no está configurado, no falla:
 * informa que se enviará al activarlo.
 */
export async function inviteHouseholdMembersAction(emails: string[]): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(emails);
  if (!parsed.success) {
    return { ok: false, sent: 0, configured: false, message: "Agrega al menos un correo válido." };
  }
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      sent: 0,
      configured: false,
      message: "Conecta Supabase para enviar invitaciones al hogar.",
    };
  }
  if (!isEmailConfigured()) {
    return {
      ok: false,
      sent: 0,
      configured: false,
      message:
        "Correos guardados. El envío se activará en cuanto se configure el proveedor de email.",
    };
  }

  const user = await getUser();
  if (!user) {
    return { ok: false, sent: 0, configured: false, message: "Inicia sesión para invitar." };
  }
  const inviter =
    (user.user_metadata?.display_name as string | undefined) ?? user.email ?? "Un familiar";
  const appUrl = getClientEnv().NEXT_PUBLIC_APP_URL;
  const supabase = await createSupabaseServerClient();

  // Asegura el hogar del invitador (lo crea como owner si aún no existe).
  const { data: householdId, error: hhErr } = await supabase.rpc("ensure_household", {});
  if (hhErr || !householdId) {
    logger.error("ensure_household fallido", { message: hhErr?.message });
    return {
      ok: false,
      sent: 0,
      configured: true,
      message: "No pudimos preparar tu hogar. Inténtalo de nuevo.",
    };
  }

  const targets = parsed.data;
  // Reutiliza el token de invitaciones pendientes ya existentes (correos repetidos).
  const tokenByEmail = new Map<string, string>();
  const { data: existing } = await supabase
    .from("household_invitations")
    .select("email, token")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .in("email", targets);
  for (const row of existing ?? []) tokenByEmail.set(row.email.toLowerCase(), row.token);

  const toInsert = targets.filter((e) => !tokenByEmail.has(e.toLowerCase()));
  if (toInsert.length) {
    const { data: inserted, error: insErr } = await supabase
      .from("household_invitations")
      .insert(toInsert.map((email) => ({ household_id: householdId, email, invited_by: user.id })))
      .select("email, token");
    if (insErr) {
      logger.error("invitaciones: insert fallido", { message: insErr.message });
      return {
        ok: false,
        sent: 0,
        configured: true,
        message: "No pudimos registrar las invitaciones. Inténtalo de nuevo.",
      };
    }
    for (const row of inserted ?? []) tokenByEmail.set(row.email.toLowerCase(), row.token);
  }

  let sent = 0;
  await Promise.all(
    targets.map(async (to) => {
      const token = tokenByEmail.get(to.toLowerCase());
      if (!token) return;
      const acceptUrl = `${appUrl}/invitacion/aceptar?token=${token}`;
      const r = await sendEmail({
        to,
        subject: `${inviter} te invitó a su hogar en Compound Ascend`,
        html: inviteHtml(inviter, acceptUrl),
        replyTo: user.email ?? undefined,
      });
      if (r.ok) sent += 1;
    }),
  );

  return {
    ok: sent > 0,
    sent,
    configured: true,
    message:
      sent > 0
        ? `Enviamos ${sent} invitación${sent > 1 ? "es" : ""}.`
        : "No pudimos enviar las invitaciones. Inténtalo de nuevo.",
  };
}

export type AcceptResult = { ok: boolean; message?: string };

/**
 * Acepta una invitación de hogar para el usuario autenticado: lo suma al mismo
 * hogar del invitador (vía RPC SECURITY DEFINER) y marca su onboarding completo.
 * No corre el wizard. El paso de nombre se resuelve aparte (pantalla mínima).
 */
export async function acceptInvitationAction(token: string): Promise<AcceptResult> {
  const parsed = z.string().uuid().safeParse(token);
  if (!parsed.success) return { ok: false, message: "Invitación no válida." };
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para aceptar la invitación." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("accept_household_invitation", { p_token: parsed.data });
  if (error) {
    logger.warn("aceptar invitación fallido", { message: error.message });
    return { ok: false, message: friendlyAcceptError(error.message) };
  }
  revalidatePath("/dashboard");
  revalidatePath("/mi-perfil-financiero");
  return { ok: true };
}

/** Traduce el mensaje de la excepción de Postgres a una copia segura en español. */
function friendlyAcceptError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("otro correo")) {
    return "Esta invitación es para otro correo. Inicia sesión con el correo invitado.";
  }
  if (m.includes("expir")) return "La invitación expiró. Pide una nueva al administrador del hogar.";
  if (m.includes("disponible") || m.includes("encontrada")) {
    return "La invitación ya no está disponible.";
  }
  return "No pudimos aceptar la invitación. Inténtalo de nuevo.";
}

function inviteHtml(inviter: string, acceptUrl: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h1 style="font-size:20px;margin:0 0 12px">Compound Ascend</h1>
    <p style="font-size:15px;line-height:1.6">
      <strong>${escapeHtml(inviter)}</strong> te invitó a unirte a su hogar para gestionar las
      finanzas en <strong>Compound Ascend</strong>, su asesor financiero con IA.
    </p>
    <p style="font-size:15px;line-height:1.6">
      Acepta la invitación con este mismo correo. Te sumarás al hogar compartido sin volver a
      configurar el perfil: solo elegirás cómo quieres que te llamemos.
    </p>
    <p style="margin:24px 0">
      <a href="${acceptUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;display:inline-block">
        Aceptar invitación
      </a>
    </p>
    <p style="font-size:12.5px;color:#777;line-height:1.5">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <span style="color:#555">${escapeHtml(acceptUrl)}</span>
    </p>
    <p style="font-size:12.5px;color:#777;line-height:1.5">
      Si no esperabas esta invitación, puedes ignorar este correo.
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/** Guardado progresivo (best-effort). */
export async function saveDraftAction(draft: ProfileDraft): Promise<SaveResult> {
  const parsed = profileDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false };
  if (!isSupabaseConfigured()) return { ok: true };
  try {
    await saveDraft(parsed.data as ProfileDraft);
    return { ok: true };
  } catch (err) {
    logger.warn("saveDraft fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false };
  }
}

/** Completa el onboarding: materializa el perfil y devuelve el diagnóstico. */
export async function completeOnboardingAction(draft: ProfileDraft): Promise<CompleteResult> {
  const parsed = profileDraftSchema.safeParse(draft);
  const safe = (parsed.success ? parsed.data : draft) as ProfileDraft;
  const diagnosis = buildDiagnosis(safe);

  if (!isSupabaseConfigured()) {
    return { ok: true, diagnosis, persisted: false };
  }

  try {
    const { completion, riskClass } = await completeProfile(safe);
    return {
      ok: true,
      diagnosis: { ...diagnosis, completion, riskClass },
      persisted: true,
    };
  } catch (err) {
    logger.error("completeOnboarding fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, diagnosis, persisted: false };
  }
}
