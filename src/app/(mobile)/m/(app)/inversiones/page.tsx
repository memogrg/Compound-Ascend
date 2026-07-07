import Link from "next/link";
import { getPortfolioReport } from "@/modules/wealth";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";

/**
 * /m/inversiones — "Inversiones". Reutiliza el barrel wealth (getPortfolioReport:
 * valor de portafolio, rendimiento, distribución por clase, holdings con
 * desempeño, dividendos). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="inversiones"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión + precios en vivo

const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

const NATURE_LABEL: Record<string, string> = { cashflow: "Flujo", growth: "Crecimiento" };

export default async function MobileInversiones() {
  const report = await getPortfolioReport();
  const a = report.analytics;
  const currency = report.currency;

  const slices: MSlice[] = Object.values(a.allocation)
    .filter((s) => s.value > 0)
    .map((s, i) => ({ label: s.label, value: s.value, color: RING_COLORS[i % RING_COLORS.length]! }));

  const holdings = [...a.holdingsWithPerformance].sort((x, y) => y.currentValue - x.currentValue);
  const gain = a.totalProfitLoss;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <div className="ov">Crecimiento</div>
            <div className="h-title" style={{ marginTop: 6 }}>
              Inversiones
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/m/indicadores" className="icon-btn" aria-label="Indicadores">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 19, height: 19 }}>
                <path d="M3 3v18h18M7 15l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/m/proteccion" className="icon-btn" aria-label="Protección">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 19, height: 19 }}>
                <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Hero: valor del portafolio + rendimiento */}
        <div className="card card-p" style={{ marginBottom: 16 }}>
          <span className="ov">Valor del portafolio</span>
          <div className="display" style={{ fontSize: 34, marginTop: 8 }}>
            {formatMoney(a.totalPortfolioValue, currency)}
          </div>
          <div className={`delta ${gain >= 0 ? "pos" : "neg"}`} style={{ marginTop: 6 }}>
            <Arrow up={gain >= 0} />
            {gain >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(gain), currency)} · {formatPercent(a.totalReturnPct, 1)} acumulado
          </div>
          <div className="mini-kpi" style={{ marginTop: 16 }}>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="k">Costo base</div>
              <div className="kv" style={{ fontSize: 18 }}>
                {formatMoney(a.totalCostBasis, currency)}
              </div>
            </div>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="k">Rendimiento</div>
              <div className={`kv ${gain >= 0 ? "pos" : "neg"}`} style={{ fontSize: 18 }}>
                {formatPercent(a.totalReturnPct, 1)}
              </div>
            </div>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="k">Dividendos/mes</div>
              <div className="kv" style={{ fontSize: 18, color: "var(--accent)" }}>
                {formatMoney(report.dividendAnalytics.monthlyDividends, currency)}
              </div>
            </div>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="k">Yield</div>
              <div className="kv" style={{ fontSize: 18 }}>
                {formatPercent(report.dividendAnalytics.dividendYield, 1)}
              </div>
            </div>
          </div>
        </div>

        {/* Distribución por clase */}
        {slices.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="sec-title" style={{ marginBottom: 12 }}>
              Distribución
            </div>
            <MDonut
              slices={slices}
              centerValue={formatCompact(a.totalPortfolioValue, currency)}
              centerLabel="invertido"
            />
          </div>
        )}

        {/* Holdings */}
        <div>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="sec-title">Mis inversiones</div>
            {holdings.length > 0 && (
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {holdings.length} {holdings.length === 1 ? "activo" : "activos"}
              </span>
            )}
          </div>
          <div className="card card-p">
            {holdings.length === 0 ? (
              <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
                Aún no registras inversiones. Agrega tu primer activo para seguir su rendimiento.
              </div>
            ) : (
              holdings.map((h) => {
                const name = h.label || h.symbol || "Inversión";
                const sub = h.nature ? NATURE_LABEL[h.nature] ?? h.assetType : h.assetType;
                const badge = (h.symbol || name).slice(0, 4).toUpperCase();
                return (
                  <div className="lrow" key={h.id}>
                    <span
                      className="lic"
                      style={{
                        background: "linear-gradient(135deg, var(--s1), var(--s5))",
                        color: "#fff",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                      aria-hidden
                    >
                      {badge}
                    </span>
                    <div>
                      <div className="lname">{name}</div>
                      <div className="lsub">{sub}</div>
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="lamt" style={{ margin: 0 }}>
                        {formatMoney(h.currentValue, currency)}
                      </div>
                      <div className={`mono ${h.returnPct >= 0 ? "pos" : "neg"}`} style={{ fontSize: 11 }}>
                        {h.returnPct >= 0 ? "+" : ""}
                        {formatPercent(h.returnPct, 1)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 12, height: 12 }}>
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
