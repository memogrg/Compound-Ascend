import { Wizard } from "@/modules/personal-profile";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import type { ProfileDraft } from "@/modules/personal-profile/types";

export const metadata = { title: "Tu perfil financiero — CARTERA+" };

/**
 * Setup Wizard del Módulo 1. Carga el borrador guardado (si Supabase está
 * configurado) para retomar donde se quedó.
 */
export default async function BienvenidaPage() {
  let initialDraft: ProfileDraft = {};
  if (isSupabaseConfigured()) {
    initialDraft = await getDraft();
  }
  return <Wizard initialDraft={initialDraft} />;
}
