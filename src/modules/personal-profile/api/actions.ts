"use server";

/**
 * Server Actions del Setup Wizard (Módulo 1).
 * Validan con Zod y persisten respetando RLS. Si Supabase aún no está
 * configurado (dev), no persisten pero devuelven el diagnóstico calculado para
 * no bloquear la experiencia.
 */
import { revalidatePath } from "next/cache";
import { escapeHtml } from "@/lib/security/escape-html";
import { profileDraftSchema } from "@/modules/personal-profile/schemas";
import {
  saveDraft,
  completeProfile,
  getDraft,
} from "@/modules/personal-profile/services/profile-service";
import {
  seedDemoTemplate,
  markOnboardingStarted,
} from "@/modules/personal-profile/services/demo-template";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { buildProfileReading } from "@/modules/personal-profile/engine/profile-reading";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";
import { generateMatices } from "@/lib/ai/profile-matices";
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
export type CompleteResult = {
  ok: boolean;
  diagnosis: ProfileDiagnosis;
  persisted: boolean;
  /** Próxima jugada dinámica calculada del estado financiero real (Palanca 1). */
  nextMove?: import("@/modules/personal-profile/engine/next-move").NextMove;
};

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
        subject: `${inviter} te invitó a su hogar en CARTERA+`,
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

/**
 * Invita a UN miembro desde Configuración, validando el límite del plan EN EL
 * SERVIDOR (no solo en la UI): si activos + pendientes ya llenan el cupo, rechaza
 * antes de crear la invitación. Reusa inviteHouseholdMembersAction para el envío.
 */
export async function inviteHouseholdMemberAction(email: string): Promise<InviteResult> {
  const one = z.string().trim().email().max(120).safeParse(email);
  if (!one.success) {
    return { ok: false, sent: 0, configured: false, message: "Agrega un correo válido." };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, sent: 0, configured: false, message: "Conecta Supabase para invitar." };
  }
  const { hasHouseholdInviteCapacity } = await import(
    "@/modules/personal-profile/services/household-members-service"
  );
  const cap = await hasHouseholdInviteCapacity();
  if (!cap.ok) {
    return {
      ok: false,
      sent: 0,
      configured: true,
      message: `Tu plan permite hasta ${cap.limit} personas en el hogar (incluido vos). No quedan cupos.`,
    };
  }
  return inviteHouseholdMembersAction([one.data]);
}

export type ManageResult = { ok: boolean; message?: string };

/** Revoca una invitación pendiente (solo owner/adult). */
export async function revokeInvitationAction(invitationId: string): Promise<ManageResult> {
  const parsed = z.string().uuid().safeParse(invitationId);
  if (!parsed.success) return { ok: false, message: "Invitación no válida." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    const { revokeInvitation } = await import(
      "@/modules/personal-profile/services/household-members-service"
    );
    await revokeInvitation(parsed.data);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No pudimos revocar." };
  }
}

/** Quita a un miembro del hogar (status='removed'; solo el owner). */
export async function removeHouseholdMemberAction(userId: string): Promise<ManageResult> {
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { ok: false, message: "Miembro no válido." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    const { removeHouseholdMember } = await import(
      "@/modules/personal-profile/services/household-members-service"
    );
    await removeHouseholdMember(parsed.data);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No pudimos quitar al miembro." };
  }
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

const displayNameSchema = z.string().trim().min(1, "Dinos cómo llamarte.").max(60);

/**
 * Guarda "¿cómo querés que te llamemos?" en profiles.display_name y en
 * user_metadata. Es el único paso del invitado tras aceptar la invitación.
 */
export async function updateDisplayNameAction(name: string): Promise<AcceptResult> {
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Nombre no válido." };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  const user = await getUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", user.id);
  if (error) {
    logger.error("updateDisplayName fallido", { message: error.message });
    return { ok: false, message: "No pudimos guardar tu nombre. Inténtalo de nuevo." };
  }
  await supabase.auth.updateUser({ data: { display_name: parsed.data } });
  revalidatePath("/dashboard");
  return { ok: true };
}

export type MaticesResult = { matices: string | null };

/**
 * Genera la "nota personal" del cierre (Fase A2) leyendo el perfil ya guardado.
 * No bloquea el cierre: ante cualquier fallo (sin sesión, sin draft, IA caída o
 * timeout) devuelve { matices: null } y la UI cae con elegancia.
 */
export async function generateProfileMaticesAction(): Promise<MaticesResult> {
  if (!isSupabaseConfigured()) return { matices: null };
  try {
    const user = await getUser();
    if (!user) return { matices: null };

    const draft = await getDraft();
    if (!draft || Object.keys(draft).length === 0) return { matices: null };

    const reading = buildProfileReading(draft);
    const arche = computeArchetype(draft);
    const name = (user.user_metadata?.display_name as string | undefined) ?? draft.displayName;

    const archetypeLabel = ARCHETYPE_PLAYBOOKS[arche.primary].label;
    const archetypeLabel2 = arche.secondary ? ARCHETYPE_PLAYBOOKS[arche.secondary].label : undefined;
    const dominantValue = draft.dineroPrimero?.replace(/_/g, " ");
    const topStrength = reading.strengths[0];
    const topOpportunity = reading.opportunities[0] ?? "";

    // Clave estable de los inputs: el caché se invalida solo si el perfil cambia.
    const key = [
      archetypeLabel,
      archetypeLabel2 ?? "",
      arche.moneyScript ?? "",
      arche.dominantEmotion ?? "",
      dominantValue ?? "",
      topStrength ?? "",
      topOpportunity,
    ].join("|");

    const supabase = await createSupabaseServerClient();
    const { data: row } = await supabase
      .from("personal_profiles")
      .select("ai_reading, ai_reading_key")
      .eq("user_id", user.id)
      .maybeSingle();
    // Caché válido: misma clave y texto presente → no llamamos a Gemini.
    if (row?.ai_reading_key === key && row.ai_reading) {
      return { matices: row.ai_reading };
    }

    const matices = await generateMatices({
      name,
      archetypeLabel,
      archetypeLabel2,
      dominantValue,
      moneyScript: arche.moneyScript ?? undefined,
      dominantEmotion: arche.dominantEmotion,
      recommendedTone: reading.companionship.tone,
      topStrength,
      topOpportunity,
    });

    // Solo persistimos cuando hay texto; si la IA no respondió, no tocamos el caché.
    if (matices !== null) {
      await supabase
        .from("personal_profiles")
        .update({ ai_reading: matices, ai_reading_key: key })
        .eq("user_id", user.id);
    }

    return { matices };
  } catch (err) {
    logger.warn("generateProfileMatices fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { matices: null };
  }
}

/** Traduce el mensaje de la excepción de Postgres a una copia segura en español. */
function friendlyAcceptError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("otro correo")) {
    return "Esta invitación es para otro correo. Inicia sesión con el correo invitado.";
  }
  if (m.includes("expir"))
    return "La invitación expiró. Pide una nueva al administrador del hogar.";
  if (m.includes("disponible") || m.includes("encontrada")) {
    return "La invitación ya no está disponible.";
  }
  return "No pudimos aceptar la invitación. Inténtalo de nuevo.";
}

function inviteHtml(inviter: string, acceptUrl: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h1 style="font-size:20px;margin:0 0 12px">CARTERA+</h1>
    <p style="font-size:15px;line-height:1.6">
      <strong>${escapeHtml(inviter)}</strong> te invitó a unirte a su hogar para gestionar las
      finanzas en <strong>CARTERA+</strong>, su asesor financiero con IA.
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
    // Próxima jugada dinámica (Palanca 1), best-effort: no rompe el cierre.
    let nextMove: CompleteResult["nextMove"];
    try {
      const { getFinancialState } = await import(
        "@/modules/personal-profile/services/financial-state"
      );
      const { buildNextMove } = await import("@/modules/personal-profile/engine/next-move");
      nextMove = buildNextMove(await getFinancialState(safe));
    } catch {
      // Sin estado: el cierre cae al nextMove estático del reading.
    }
    return {
      ok: true,
      diagnosis: { ...diagnosis, completion, riskClass },
      persisted: true,
      nextMove,
    };
  } catch (err) {
    logger.error("completeOnboarding fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, diagnosis, persisted: false };
  }
}
