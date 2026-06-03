import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { ProfileDashboard } from "@/modules/personal-profile/components/profile-dashboard";
import { EmptyState } from "@/components/shared/states";
import type { ProfileDraft } from "@/modules/personal-profile/types";

/**
 * Vista del Módulo 1 dentro del panel: muestra los resultados del perfil tipo
 * dashboard (con opción de editar) o invita a empezar el Setup Wizard.
 */
export default async function Page() {
  let draft: ProfileDraft = {};
  let started = false;
  if (isSupabaseConfigured()) {
    draft = await getDraft();
    started = Object.keys(draft).length > 0;
  }

  if (!started) {
    return (
      <EmptyState
        icon="profile"
        title="Construyamos tu perfil financiero"
        description="Unos minutos en un asistente conversacional para crear tu ADN financiero. Con él, todo lo demás se personaliza: presupuesto, alertas, metas, inversiones y protección."
        action={
          <Link className="btn btn-primary" href="/bienvenida">
            Empezar mi perfil
          </Link>
        }
      />
    );
  }

  return <ProfileDashboard draft={draft} diagnosis={buildDiagnosis(draft)} />;
}
