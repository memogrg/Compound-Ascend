import { isSupabaseConfigured } from "@/lib/auth/session";
import {
  getRichLifeSummary,
  buildDemoRichLifeSummary,
} from "@/modules/rich-life/services/rich-life-service";
import { RichLifeDashboard } from "@/modules/rich-life/components/rich-life-dashboard";
import { RichActions } from "@/modules/rich-life/components/rich-actions";
import type { RichLifeSummary } from "@/modules/rich-life/services/rich-life-service";

/**
 * Módulo 5 — Mi Rich Life. El cierre gerencial: patrimonio neto, indicadores de
 * riqueza y la respuesta a ¿me estoy haciendo más rico, estable o más pobre?
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const summary: RichLifeSummary = configured
    ? await getRichLifeSummary()
    : buildDemoRichLifeSummary();

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
          <div className="card-title">Mi Rich Life</div>
          <div className="card-sub">
            No buscamos perfección contable, buscamos dirección. Si tu patrimonio sube y tus
            decisiones mejoran, estás ganando.
          </div>
        </div>
        <RichActions currency={summary.currency} />
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración con datos de ejemplo. Conecta Supabase para construir tu mapa de riqueza
          real.
        </div>
      ) : null}

      <RichLifeDashboard summary={summary} />
    </div>
  );
}
