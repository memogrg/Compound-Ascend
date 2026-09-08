/**
 * /mis-acciones — el único lugar donde viven las recomendaciones.
 *
 * Server component: arma el plan y la vista de Decisiones con los motores reales y le pasa a la
 * UI datos ya calculados. El comparador del excedente se RENDERIZA acá (<SurplusDecision/>, el
 * mismo que se usaba en el panel) y viaja como nodo hasta la pestaña — reutilizado, no reescrito.
 */
import { Suspense } from "react";
import {
  ActionsView,
  DecisionsTab,
  getActionPlan,
  getActionProgress,
  getDecisionsView,
  type ActionsTab,
  type MiniComparison,
} from "@/modules/actions";
import { SurplusDecision } from "@/modules/wealth";

export const dynamic = "force-dynamic"; // datos por sesión: nunca estático

const TABS: ActionsTab[] = ["mes", "decisiones", "progreso"];

async function Contenido({ tab, deuda }: { tab: ActionsTab; deuda?: string }) {
  const [plan, progress, decisions] = await Promise.all([
    getActionPlan(),
    getActionProgress(),
    getDecisionsView(deuda),
  ]);

  // Comparador MINI de la hero: el mismo reporte del excedente, resumido. El lado "invertir"
  // toma el primer activo (S&P 500) solo cuando la regla del 12% no aplica.
  const principal = decisions.surplus.invest[0];
  const peor = principal?.scenarios.find((s) => s.band === "peor");
  const tipico = principal?.scenarios.find((s) => s.band === "tipico");
  const mini: MiniComparison = {
    gated: decisions.surplus.gated,
    apr: decisions.surplus.apr,
    pay: decisions.surplus.pay,
    invertir:
      principal && peor && tipico
        ? {
            label: principal.label,
            peor: peor.endValue,
            tipico: tipico.endValue,
            maxDrawdown: principal.maxDrawdown,
          }
        : null,
    monthlySurplus: decisions.surplus.monthlySurplus,
  };

  return (
    <ActionsView
      plan={plan}
      progress={progress}
      mini={mini}
      initialTab={tab}
      decisiones={
        <DecisionsTab
          view={decisions}
          comparador={<SurplusDecision report={decisions.surplus} />}
        />
      }
    />
  );
}

function Skeleton() {
  return (
    <div className="grid" aria-hidden="true">
      <div className="skel" style={{ height: 34, width: 240 }} />
      <div className="skel" style={{ height: 40 }} />
      <div className="acc-layout">
        <div className="acc-main">
          <div className="skel" style={{ height: 70 }} />
          <div className="skel" style={{ height: 230 }} />
          <div className="skel" style={{ height: 120 }} />
        </div>
        <div className="skel" style={{ height: 380 }} />
      </div>
    </div>
  );
}

export default async function MisAccionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pedido = typeof sp.tab === "string" ? sp.tab : "mes";
  const tab = (TABS as string[]).includes(pedido) ? (pedido as ActionsTab) : "mes";
  const deuda = typeof sp.deuda === "string" ? sp.deuda : undefined;

  return (
    <Suspense fallback={<Skeleton />}>
      <Contenido tab={tab} deuda={deuda} />
    </Suspense>
  );
}
