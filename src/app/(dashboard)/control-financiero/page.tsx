import { isSupabaseConfigured } from "@/lib/auth/session";
import {
  getControlSummary,
  buildDemoControlSummary,
} from "@/modules/control/services/control-service";
import { ControlDashboard } from "@/modules/control/components/control-dashboard";
import { ControlActions } from "@/modules/control/components/control-actions";
import type { ControlSummary } from "@/modules/control/services/control-service";

/**
 * Módulo 3 — Control Financiero. El Motor de Prioridad cruza objetivos, deudas y
 * flujo libre para decidir la mejor secuencia y tu próxima mejor acción.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const summary: ControlSummary = configured
    ? await getControlSummary()
    : buildDemoControlSummary();

  return (
    <div className="grid">
      <div
        className="card card-pad"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="card-title">Control financiero</div>
          <div className="card-sub">
            Vamos a revisar si tus ahorros y obligaciones trabajan a tu favor.
          </div>
        </div>
        <ControlActions
          currency={summary.currency}
          indexRates={summary.indexRates}
          fxRates={summary.fxRates}
        />
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración con datos de ejemplo. Conecta Supabase para gestionar tus objetivos y
          deudas reales.
        </div>
      ) : null}

      <ControlDashboard summary={summary} />
    </div>
  );
}
