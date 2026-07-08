import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getWealthSummary, buildDemoWealthSummary } from "@/modules/wealth/services/wealth-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getSnapshotHistory } from "@/modules/wealth/services/snapshot-service";
import { listDividends } from "@/modules/wealth/services/dividend-service";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { listPendingHoldings } from "@/modules/wealth/services/holdings-service";
import { ensureMonthlyContributions, ensureMonthlyPremiums, listOpenContributions } from "@/modules/wealth/services/contribution-service";
import { PendingHoldingsCard } from "@/modules/wealth/components/pending-holdings-card";
import { GrowthView } from "@/modules/wealth/components/growth-view";
import { PortfolioView } from "@/modules/wealth/components/portfolio-view";
import { Icon } from "@/components/ui/icon";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { buildWealthAdvice, type WealthAdvice } from "@/modules/wealth/engine/wealth-advice";
import { AdvisorNote } from "@/components/shared/advisor-note";
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
  // Asegura el aporte mensual de holdings recurrentes (brecha DCA). Best-effort.
  await ensureMonthlyContributions().catch(() => {});
  await ensureMonthlyPremiums().catch(() => {});

  const [report, snapshots, dividends, base, displayCurrency, rates, openContributions] = await Promise.all([
    getPortfolioReport(),
    getSnapshotHistory("all"),
    listDividends(),
    getBaseSummary(),
    getDisplayCurrency(),
    getFxRates(),
    listOpenContributions(),
  ]);

  // Nota del asesor (Fase 5b): recomendación sobre el patrimonio en su tono. Best-effort.
  let advice: WealthAdvice | null = null;
  try {
    const draft = await getDraft();
    if (Object.keys(draft).length > 0) {
      const diag = buildDiagnosis(draft);
      const slices = Object.values(report.analytics.allocation);
      const top = slices.reduce<(typeof slices)[number] | undefined>(
        (a, b) => (a && a.pct >= b.pct ? a : b),
        undefined,
      );
      advice = buildWealthAdvice({
        archetypeLabel: diag.archetypeLabel,
        riskClass: diag.riskClass,
        hasEmergencyFund: draft.hasEmergencyFund,
        dominantValue: draft.dineroPrimero?.replace(/_/g, " "),
        value: report.analytics.totalPortfolioValue,
        topLabel: top?.label,
        topPct: top?.pct,
        holdingsCount: report.holdings.length,
      });
    }
  } catch {
    // Sin perfil/diagnóstico: la sección sigue sin la nota.
  }

  return (
    <>
      {advice ? <AdvisorNote {...advice} /> : null}
      <PortfolioView
        report={report}
        snapshots={snapshots}
        dividends={dividends}
        summary={summary}
        investmentRate={base.indicators.investmentRate}
        displayCurrency={displayCurrency}
        rates={rates}
        openContributions={openContributions}
      />
    </>
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
  const pendingHoldings = configured ? await listPendingHoldings() : [];

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
        <PendingHoldingsCard holdings={pendingHoldings} currency={summary.currency} />
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
