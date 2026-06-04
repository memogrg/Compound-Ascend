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
 * Envía invitaciones por correo a los miembros de la familia. Los correos ya se
 * guardan en el perfil al avanzar; esto dispara el email. Si el proveedor de
 * email no está configurado, no falla: informa que se enviará al activarlo.
 */
export async function inviteHouseholdMembersAction(emails: string[]): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(emails);
  if (!parsed.success) {
    return { ok: false, sent: 0, configured: false, message: "Agrega al menos un correo válido." };
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
  const inviter =
    (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? "Un familiar";
  const appUrl = getClientEnv().NEXT_PUBLIC_APP_URL;

  let sent = 0;
  await Promise.all(
    parsed.data.map(async (to) => {
      const r = await sendEmail({
        to,
        subject: `${inviter} te invitó a gestionar las finanzas en familia`,
        html: inviteHtml(inviter, appUrl),
        replyTo: user?.email ?? undefined,
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

function inviteHtml(inviter: string, appUrl: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h1 style="font-size:20px;margin:0 0 12px">Compound Ascend</h1>
    <p style="font-size:15px;line-height:1.6">
      <strong>${escapeHtml(inviter)}</strong> te invitó a unirte para gestionar las finanzas de la
      familia en <strong>Compound Ascend</strong>, tu asesor financiero con IA.
    </p>
    <p style="font-size:15px;line-height:1.6">
      Crea tu cuenta con este mismo correo para sumarte a la gestión compartida.
    </p>
    <p style="margin:24px 0">
      <a href="${appUrl}/signup" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;display:inline-block">
        Unirme a la familia
      </a>
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
