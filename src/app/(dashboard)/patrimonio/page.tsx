import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getWealthSummary, buildDemoWealthSummary } from "@/modules/wealth/services/wealth-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getSnapshotHistory } from "@/modules/wealth/services/snapshot-service";
import { listDividends } from "@/modules/wealth/services/dividend-service";
import { GrowthView } from "@/modules/wealth/components/growth-view";
import { PortfolioView } from "@/modules/wealth/components/portfolio-view";
import { WealthActions } from "@/modules/wealth/components/wealth-actions";
import { Icon } from "@/components/ui/icon";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";

/**
 * Módulo 4 — Patrimonio (Crecimiento). Cartera con 4 paneles
 * (Resumen/Cartera/Dividendos/Rendimiento). La defensa vive en /patrimonio/proteccion.
 */

/**
 * El portafolio consulta precios en vivo (proveedores externos): es la parte
 * lenta de la página. Componente async dentro de Suspense para que el header
 * pinte de inmediato y la cartera llegue en streaming.
 */
async function PortfolioSection({ summary }: { summary: WealthSummary }) {
  const [report, snapshots, dividends] = await Promise.all([
    getPortfolioReport(),
    getSnapshotHistory("all"),
    listDividends(),
  ]);
  return (
    <PortfolioView report={report} snapshots={snapshots} dividends={dividends} summary={summary} />
  );
}

function PortfolioSkeleton() {
  return (
    <div className="grid" aria-hidden="true">
      <div className="skel" style={{ height: 120 }} />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="skel" style={{ height: 280 }} />
        <div className="skel" style={{ height: 280 }} />
      </div>
      <div className="skel" style={{ height: 220 }} />
    </div>
  );
}

export default async function Page() {
  const configured = isSupabaseConfigured();
  const summary: WealthSummary = configured ? await getWealthSummary() : buildDemoWealthSummary();

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
          <div className="card-title">Mi patrimonio</div>
          <div className="card-sub">
            Invertir te ayuda a crecer; protegerte evita retroceder. Sin venderte nada que no tenga
            sentido para tu momento.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <WealthActions mode="investment" currency={summary.currency} />
          <Link className="btn btn-secondary" href="/patrimonio/indicadores">
            <Icon name="networth" width={2} /> Indicadores
          </Link>
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

      {configured ? (
        <Suspense fallback={<PortfolioSkeleton />}>
          <PortfolioSection summary={summary} />
        </Suspense>
      ) : (
        <GrowthView summary={summary} />
      )}
    </div>
  );
}
