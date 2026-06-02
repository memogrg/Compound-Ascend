import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { computeCompletion } from "@/modules/personal-profile/engine/diagnosis";
import { EmptyState } from "@/components/shared/states";

/**
 * Vista del Módulo 1 dentro del panel: muestra el avance del perfil y permite
 * iniciar o retomar el Setup Wizard.
 */
export default async function Page() {
  let completion = 0;
  let started = false;
  if (isSupabaseConfigured()) {
    const draft = await getDraft();
    completion = computeCompletion(draft);
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

  return (
    <div className="grid">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="label">Tu perfil financiero</div>
            <div className="num-xl" style={{ fontSize: 34, marginTop: 8 }}>
              {completion}% <span style={{ fontSize: 16, color: "var(--muted)" }}>completo</span>
            </div>
          </div>
          <Link className="btn btn-primary" href="/bienvenida">
            {completion >= 100 ? "Revisar perfil" : "Continuar mi perfil"}
          </Link>
        </div>
        <div className="bar-track" style={{ marginTop: 16 }}>
          <div className="bar-fill" style={{ width: `${completion}%`, background: "var(--pos)" }} />
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
          Tu perfil es el cerebro contextual de la app. Cuanto más completo, mejores y más
          personalizadas serán tus recomendaciones.
        </p>
      </div>
    </div>
  );
}
