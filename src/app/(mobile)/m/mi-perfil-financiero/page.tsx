import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { getDraft, buildDiagnosis } from "@/modules/personal-profile";
import type { ProfileDraft } from "@/modules/personal-profile/types";

import { MobileProfileWizard } from "../perfil-financiero/mobile-profile-wizard";
import { MobileProfileResults } from "./mobile-profile-results";

/**
 * /m/mi-perfil-financiero — paridad con la web /mi-perfil-financiero ("Mi Perfil
 * Financiero", nombre exacto de nav.ts). Replica el patrón de la web con la MISMA
 * condición: si el draft está vacío → wizard; si no → resultados del ADN financiero.
 * Reutiliza getDraft + buildDiagnosis del módulo y el wizard ya existente
 * (/m/perfil-financiero, que sigue disponible para editar). es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu ADN financiero · CARTERA+" };

export default async function MobileMiPerfilFinanciero() {
  const user = await getUser();
  if (!user) redirect("/m/login");

  let draft: ProfileDraft = {};
  try {
    draft = await getDraft();
  } catch {
    draft = {};
  }

  // Misma condición que la web: draft vacío ⇒ aún no empezó ⇒ wizard.
  if (Object.keys(draft).length === 0) {
    return (
      <div className="m-scroll m-scroll-flush">
        <div className="m-pad">
          <MobileProfileWizard initialDraft={draft} />
        </div>
      </div>
    );
  }

  const diagnosis = buildDiagnosis(draft);
  return <MobileProfileResults draft={draft} diagnosis={diagnosis} />;
}
