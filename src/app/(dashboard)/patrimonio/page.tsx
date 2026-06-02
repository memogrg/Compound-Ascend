import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import {
  getWealthSummary,
  buildDemoWealthSummary,
} from "@/modules/wealth/services/wealth-service";
import { GrowthView } from "@/modules/wealth/components/growth-view";
import { WealthActions } from "@/modules/wealth/components/wealth-actions";
import { Icon } from "@/components/ui/icon";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";

/**
 * Módulo 4 — Patrimonio (Crecimiento). Diseña la ofensiva: invertir con
 * inteligencia. La defensa (protección) vive en /patrimonio/proteccion.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const summary: WealthSummary = configured ? await getWealthSummary() : buildDemoWealthSummary();

  return (
    <div className="grid">
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-title">Mi patrimonio</div>
          <div className="card-sub">
            Invertir te ayuda a crecer; protegerte evita retroceder. Sin venderte nada que no tenga
            sentido para tu momento.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <WealthActions mode="investment" currency={summary.currency} />
          <Link className="btn btn-secondary" href="/patrimonio/proteccion">
            <Icon name="defense" width={2} /> Protección
          </Link>
        </div>
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración con datos de ejemplo. Conecta Supabase para gestionar tus inversiones
          reales y ver precios en vivo.
        </div>
      ) : null}

      <GrowthView summary={summary} />
    </div>
  );
}
