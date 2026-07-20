import { getPortfolioReport } from "@/modules/wealth";
import {
  ensureMonthlyContributions,
  listOpenContributions,
} from "@/modules/wealth/services/contribution-service";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";
import { MobileHeader } from "../../components/mobile-header";
import {
  MSummaryCard,
  MSectionHeader,
  MMetricGrid,
  MMetricCard,
  mAmount,
} from "../../components/content-kit";
import { InversionesManager } from "./inversiones-manager";

/**
 * /m/inversiones — "Inversiones". Reutiliza el barrel wealth (getPortfolioReport:
 * valor de portafolio, rendimiento, distribución por clase, holdings con
 * desempeño, dividendos). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="inversiones"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión + precios en vivo

// El anillo de composición NO usa --s3: es el mismo rojo que --danger, y aquí las
// porciones son clases de activo, no pérdidas. Va el neutro cálido de series.
const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s-neutral)", "var(--s4)", "var(--s5)"];

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
  // 0 no es ni ganancia ni pérdida: sin signo y en neutro (como en Ingresos/Ahorro, donde
  // "+₡0" verde sugería que ibas por encima). >0 gana (verde), <0 pierde (rojo).
  const gainDir = gain > 0 ? 1 : gain < 0 ? -1 : 0;
  const gainSign = gainDir > 0 ? "+" : gainDir < 0 ? "−" : "";
  const gainTone = gainDir > 0 ? "success" : gainDir < 0 ? "danger" : "neutral";

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" home eyebrow="Crecimiento" title="Portafolio de inversiones" />

        {/* Resumen: valor del portafolio (exacto mientras quepa) + ganancia/pérdida.
            Los montos YA vienen en la moneda primaria (portfolio-service normaliza con
            convertCurrency antes de los engines) → se muestran en crudo, sin reconvertir. */}
        <MSummaryCard
          eyebrow="Valor del portafolio"
          value={mAmount(a.totalPortfolioValue, currency, 11)}
          chip={
            <span className={`badge ${gainDir > 0 ? "up" : gainDir < 0 ? "down" : "neutral"}`}>
              {gainSign}
              {formatPercent(Math.abs(a.totalReturnPct), 1)}
            </span>
          }
          sub={
            a.totalPortfolioValue > 0
              ? gainDir === 0
                ? `Sin cambio sobre ${formatMoney(a.totalCostBasis, currency)} invertidos.`
                : `${gainDir > 0 ? "Ganas" : "Pierdes"} ${formatMoney(Math.abs(gain), currency)} sobre ${formatMoney(a.totalCostBasis, currency)} invertidos.`
              : "Registra tu primera inversión para seguir su rendimiento."
          }
          style={{ marginBottom: 16 }}
        />

        {/* Métricas: los 4 KPI que iban sueltos en el hero. Retornos con color semántico. */}
        {holdings.length > 0 && (
          <>
            <MSectionHeader title="Tu portafolio en números" />
            <MMetricGrid style={{ marginBottom: 16 }}>
              <MMetricCard label="Invertido" value={mAmount(a.totalCostBasis, currency, 8)} sub="costo base" />
              <MMetricCard
                label="Ganancia/pérdida"
                value={`${gainSign}${mAmount(Math.abs(gain), currency, 7)}`}
                sub="no realizada"
                tone={gainTone}
              />
              <MMetricCard
                label="Dividendos/mes"
                value={mAmount(report.dividendAnalytics.monthlyDividends, currency, 8)}
                sub={`yield ${formatPercent(report.dividendAnalytics.dividendYield, 1)}`}
                tone={report.dividendAnalytics.monthlyDividends > 0 ? "success" : "neutral"}
              />
              <MMetricCard
                label="Posiciones"
                value={String(holdings.length)}
                sub={slices.length > 0 ? `${slices.length} ${slices.length === 1 ? "clase" : "clases"}` : "de activo"}
              />
            </MMetricGrid>
          </>
        )}

        {/* Distribución por clase — MDonut INTERACTIVO (R5): su lógica y props no se tocan. */}
        {slices.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Distribución por clase" />
            {/* centerValue en COMPACTO a propósito: el centro del donut es diminuto y el
                gráfico R5 se diseñó con formatCompact; mAmount dejaría exacto un número
                que ahí se desbordaría. No lo cambies a mAmount. */}
            <MDonut
              slices={slices}
              centerValue={formatCompact(a.totalPortfolioValue, currency)}
              centerLabel="invertido"
              currency={currency}
            />
          </div>
        )}

        {/* Holdings + gestión (alta/edición/eliminar · compra/venta/dividendo) */}
        <MSectionHeader
          title="Mis inversiones"
          action={
            holdings.length > 0 ? (
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                {holdings.length} {holdings.length === 1 ? "activo" : "activos"}
              </span>
            ) : undefined
          }
        />
        <InversionesManager holdings={holdings} currency={currency} openContributions={openContributions} />
      </div>
    </div>
  );
}
