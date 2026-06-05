import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getIndicatorsViewModel } from "@/modules/wealth/services/indicators-service";
import { getMacroInsights, type MacroInsight } from "@/modules/wealth";
import { IndicatorsView } from "@/modules/wealth/components/indicators-view";
import { Icon } from "@/components/ui/icon";
import type { IndicatorsViewModel } from "@/modules/wealth/services/indicators-service";

/**
 * Sub-vista de Patrimonio — Mercado e Indicadores. Indicadores económicos
 * (BCCR + FRED) como contexto macro informativo. Datos globales leídos de BD.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const [model, insights]: [IndicatorsViewModel, MacroInsight[]] = configured
    ? await Promise.all([getIndicatorsViewModel(), getMacroInsights().catch(() => [])])
    : [{ groups: [], hasData: false }, []];

  return (
    <div className="grid">
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-title">Mercado e indicadores</div>
          <div className="card-sub">
            Contexto macro de Costa Rica y EE. UU. Informativo: te ayuda a leer tu entorno, no a
            ejecutar decisiones.
          </div>
        </div>
        <Link className="btn btn-secondary" href="/patrimonio">
          <Icon name="invest" width={2} /> Crecimiento
        </Link>
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración. Conecta Supabase para ver los indicadores económicos en vivo.
        </div>
      ) : (
        <IndicatorsView model={model} insights={insights} />
      )}
    </div>
  );
}
