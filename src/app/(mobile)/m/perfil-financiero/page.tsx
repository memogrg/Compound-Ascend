import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { getDraft } from "@/modules/personal-profile";
import type { ProfileDraft } from "@/modules/personal-profile/types";

import { MobileProfileWizard } from "./mobile-profile-wizard";

/**
 * Wizard del ADN financiero en móvil (/m/perfil-financiero).
 * Vive FUERA del grupo (app) → sin tab bar (flujo enfocado, como el diseño), pero
 * requiere sesión: guarda aquí (misma cookie que la web) y redirige a /m/login si no
 * hay. Precarga el draft existente con getDraft() para poder editar/continuar.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu ADN financiero · CARTERA+" };

export default async function MobilePerfilFinanciero() {
  const user = await getUser();
  if (!user) redirect("/m/login");

  // Precarga el draft guardado (vacío la primera vez). Best-effort: si falla, arranca limpio.
  let initialDraft: ProfileDraft = {};
  try {
    initialDraft = await getDraft();
  } catch {
    initialDraft = {};
  }

  return (
    <div className="m-scroll m-scroll-flush">
      <div className="m-pad">
        <MobileProfileWizard initialDraft={initialDraft} />
      </div>
    </div>
  );
}
