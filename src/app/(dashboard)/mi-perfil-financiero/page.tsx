import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import {
  getDraft,
  getHouseholdContext,
  getHouseholdProfileDraft,
} from "@/modules/personal-profile/services/profile-service";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { ProfileDashboard } from "@/modules/personal-profile/components/profile-dashboard";
import { EmptyState } from "@/components/shared/states";

/**
 * Vista del Módulo 1 dentro del panel: muestra los resultados del perfil tipo
 * dashboard (con opción de editar) o invita a empezar el Setup Wizard.
 *
 * El invitado de un hogar NO corre el wizard: ve el perfil del hogar en modo
 * solo lectura (lo heredó del owner).
 */
export default async function Page() {
  if (!isSupabaseConfigured()) {
    return <StartProfile />;
  }

  const ctx = await getHouseholdContext();
  if (ctx.isInvitedMember) {
    const draft = await getHouseholdProfileDraft();
    if (Object.keys(draft).length === 0) {
      return (
        <EmptyState
          icon="profile"
          title="Perfil del hogar en construcción"
          description="El administrador de tu hogar aún no ha configurado el perfil financiero. En cuanto lo haga, lo verás aquí."
        />
      );
    }
    return <ProfileDashboard draft={draft} diagnosis={buildDiagnosis(draft)} readOnly />;
  }

  const draft = await getDraft();
  if (Object.keys(draft).length === 0) {
    return <StartProfile />;
  }
  return <ProfileDashboard draft={draft} diagnosis={buildDiagnosis(draft)} />;
}

function StartProfile() {
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
