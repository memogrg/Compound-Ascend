import { getPortfolioReport } from "@/modules/wealth";
import {
  ensureMonthlyContributions,
  listOpenContributions,
} from "@/modules/wealth/services/contribution-service";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";
import { MobileHeader } from "../../components/mobile-header";
import { InversionesManager } from "./inversiones-manager";

/**
 * /m/inversiones — "Inversiones". Reutiliza el barrel wealth (getPortfolioReport:
 * valor de portafolio, rendimiento, distribución por clase, holdings con
 * desempeño, dividendos). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="inversiones"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión + precios en vivo

const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

export default async function MobileInversiones() {
  // Brecha DCA: registra el aporte del mes de los holdings recurrentes (best-effort,
  // idempotente). Mismo patrón que la web /patrimonio — sin esto, un usuario solo-móvil
  // nunca vería el aporte pendiente. Luego se leen los aportes abiertos para el banner.
  await ensureMonthlyContributions().catch(() => {});
  const [report, openContributions] = await Promise.all([
    getPortfolioReport(),
    listOpenContributions(),
  ]);
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
        <MobileHeader variant="inner" eyebrow="Crecimiento" title="Portafolio de inversiones" />

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
              <div className="kv" style={{ fontSize: 18, whiteSpace: "nowrap" }}>
                {formatCompact(a.totalCostBasis, currency)}
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
              <div className="kv" style={{ fontSize: 18, color: "var(--accent)", whiteSpace: "nowrap" }}>
                {formatCompact(report.dividendAnalytics.monthlyDividends, currency)}
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

        {/* Holdings + gestión (alta/edición/eliminar · compra/venta/dividendo) */}
        <div>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="sec-title">Mis inversiones</div>
            {holdings.length > 0 && (
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {holdings.length} {holdings.length === 1 ? "activo" : "activos"}
              </span>
            )}
          </div>
          <InversionesManager
            holdings={holdings}
            currency={currency}
            openContributions={openContributions}
          />
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
