import { Wizard } from "@/modules/personal-profile";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { attributeReferralFromCookie } from "@/lib/referrals/service";
import type { ProfileDraft } from "@/modules/personal-profile/types";

export const metadata = { title: "Tu perfil financiero — CARTERA+" };

/**
 * Setup Wizard del Módulo 1. Carga el borrador guardado (si Supabase está
 * configurado) para retomar donde se quedó.
 */
export default async function BienvenidaPage() {
  let initialDraft: ProfileDraft = {};
  if (isSupabaseConfigured()) {
    // Red de seguridad de la atribución: el camino normal es /auth/callback,
    // pero un alta que establezca sesión sin pasar por ahí (confirmación de
    // correo desactivada, sesión ya viva al abrir el link) llegaría igual a esta
    // pantalla. Es idempotente por el UNIQUE de referred_user_id, así que
    // llamarla dos veces no duplica nada.
    await attributeReferralFromCookie();
    initialDraft = await getDraft();
  }
  return <Wizard initialDraft={initialDraft} />;
}
