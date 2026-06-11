import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import {
  getWealthSummary,
  buildDemoWealthSummary,
} from "@/modules/wealth/services/wealth-service";
import { DefenseView } from "@/modules/wealth/components/defense-view";
import { WealthActions } from "@/modules/wealth/components/wealth-actions";
import { Icon } from "@/components/ui/icon";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";

/**
 * Módulo 4 — Defensa Patrimonial. Tu blindaje: coberturas y brechas de
 * protección, con secuencia ética (diagnóstico antes que venta).
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const summary: WealthSummary = configured ? await getWealthSummary() : buildDemoWealthSummary();

  return (
    <div className="grid">
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-title">Defensa patrimonial</div>
          <div className="card-sub">
            Si algo inesperado pasa, ¿qué tan protegida está tu vida financiera?
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <WealthActions mode="policy" currency={summary.currency} deepLinkKey="policy" />
          <Link className="btn btn-secondary" href="/patrimonio">
            <Icon name="invest" width={2} /> Crecimiento
          </Link>
        </div>
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración con datos de ejemplo. Conecta Supabase para gestionar tus pólizas reales.
        </div>
      ) : null}

      <DefenseView summary={summary} />
    </div>
  );
}
