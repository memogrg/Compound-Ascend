import { getRichLifeSummary } from "@/modules/rich-life";
import { getSnapshotHistory } from "@/modules/wealth";
import { MobileHeader } from "../../components/mobile-header";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";
import { formatMoney, formatCompact } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";
import { MScrubChart, type MPoint } from "../../components/m-scrub-chart";
import { PatrimonioManager } from "./patrimonio-manager";

/**
 * /m/patrimonio — "Patrimonio" (nombre canónico de nav.ts). Reutiliza el barrel rich-life (getRichLifeSummary:
 * patrimonio neto, indicadores, distribución por clase, pasivos) + el helper puro
 * computeWealthBreakdown (invertido/líquido/otros). Sin reimplementar cálculos.
 * Piel del diseño (data-screen="patrimonio"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

export default async function MobilePatrimonio() {
  const summary = await getRichLifeSummary();
  const { snapshot, assets, allAssets, liabilities, currency } = summary;
  const ind = snapshot.indicators;
  const bd = computeWealthBreakdown(allAssets); // invertido / líquido / otros (o undefined)

  // Historia REAL de patrimonio neto (snapshots) para el gráfico con scrub. Sin datos inventados:
  // si aún no hay ≥2 snapshots, el chart degrada a estático.
  const snapshots = await getSnapshotHistory("all");
  const nwPoints: MPoint[] = snapshots.map((s) => ({
    label: new Date(`${s.date}T00:00:00`).toLocaleDateString("es-CR", { day: "numeric", month: "short" }),
    value: s.netWorth,
  }));

  // Distribución por clase (ya agrupada por el engine); mapeamos a los colores del móvil.
  const slices: MSlice[] = snapshot.assetsByClass
    .filter((c) => c.value > 0)
    .slice(0, 5)
    .map((c, i) => ({ label: c.label, value: c.value, color: RING_COLORS[i % RING_COLORS.length]! }));

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow="Crecimiento" title="Patrimonio" />

        {/* Hero: patrimonio neto + cambio del mes */}
        <div className="hero-nw" style={{ marginBottom: 16 }}>
          <div className="ov">Patrimonio neto total</div>
          <div className="hero-amt" style={{ marginTop: 6 }}>
            {formatMoney(ind.netWorth, currency)}
          </div>
          {ind.wealthVelocity != null && (
            <div className={`delta ${ind.wealthVelocity >= 0 ? "pos" : "neg"}`} style={{ marginTop: 8 }}>
              <Arrow up={ind.wealthVelocity >= 0} />
              {formatMoney(ind.wealthVelocity, currency)} este mes
            </div>
          )}
          {/* Tendencia real del patrimonio neto (arrastra para ver cada punto). */}
          {nwPoints.length >= 2 ? (
            <div style={{ marginTop: 14 }}>
              <MScrubChart points={nwPoints} currency={currency} />
            </div>
          ) : null}
        </div>

        {/* Desglose invertido / líquido / deuda */}
        <div className="mini-kpi" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Invertido</div>
            {/* Abreviado a millones (₡347,9 M) para una sola línea, como el centro de la dona. */}
            <div className="kv pos" style={{ fontSize: 17, whiteSpace: "nowrap" }}>
              {formatCompact(bd?.invested ?? 0, currency)}
            </div>
          </div>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Líquido</div>
            <div className="kv" style={{ fontSize: 17, whiteSpace: "nowrap" }}>
              {formatCompact(bd?.liquid ?? 0, currency)}
            </div>
          </div>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Deuda</div>
            <div className="kv neg" style={{ fontSize: 17, whiteSpace: "nowrap" }}>
              {formatCompact(ind.totalLiabilities, currency)}
            </div>
          </div>
        </div>

        {/* Distribución (donut + leyenda) */}
        {slices.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="sec-title" style={{ marginBottom: 12 }}>
              Composición
            </div>
            <MDonut
              slices={slices}
              centerValue={formatCompact(ind.totalAssets, currency)}
              centerLabel="activos"
              currency={currency}
            />
          </div>
        )}

        {/* Activos y pasivos manuales — CRUD (FAB alta · SwipeRow editar/eliminar) */}
        <div>
          <div className="sec-title" style={{ marginBottom: 6 }}>
            Activos y pasivos
          </div>
          <PatrimonioManager assets={assets} liabilities={liabilities} currency={currency} />
        </div>
      </div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 13, height: 13 }}>
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

