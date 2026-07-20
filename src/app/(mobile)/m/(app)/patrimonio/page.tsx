import { getRichLifeSummary } from "@/modules/rich-life";
import { getSnapshotHistory, ensureTodaySnapshot } from "@/modules/wealth";
import { MobileHeader } from "../../components/mobile-header";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";
import { formatMoney, formatCompact } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";
import { MScrubChart, type MPoint } from "../../components/m-scrub-chart";
import {
  MSummaryCard,
  MSectionHeader,
  MMetricGrid,
  MMetricCard,
  MChip,
  mAmount,
} from "../../components/content-kit";
import { PatrimonioManager } from "./patrimonio-manager";

/**
 * /m/patrimonio — "Patrimonio" (nombre canónico de nav.ts). Reutiliza el barrel rich-life (getRichLifeSummary:
 * patrimonio neto, indicadores, distribución por clase, pasivos) + el helper puro
 * computeWealthBreakdown (invertido/líquido/otros). Sin reimplementar cálculos.
 * Piel del diseño (data-screen="patrimonio"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

// El anillo de composición NO usa --s3: es el mismo rojo que --danger, y aquí las
// porciones son clases de activo, no pérdidas. Va el neutro cálido de series.
const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s-neutral)", "var(--s4)", "var(--s5)"];

export default async function MobilePatrimonio() {
  const summary = await getRichLifeSummary();
  const { snapshot, assets, allAssets, liabilities, currency } = summary;
  const ind = snapshot.indicators;
  const bd = computeWealthBreakdown(allAssets); // invertido / líquido / otros (o undefined)

  // Deja registrado el punto de HOY antes de leer la serie (best-effort e idempotente, mismo
  // patrón que ensureMonthlyContributions en Inversiones). Sin esto la tabla se quedaba vacía
  // —no había nada que escribiera snapshots— y el gráfico no aparecía nunca. Si falla, la
  // pantalla se pinta igual: solo se queda sin el punto de hoy.
  await ensureTodaySnapshot(ind.netWorth, currency).catch(() => {});

  // Historia REAL de patrimonio neto (snapshots) para el gráfico con scrub. Sin datos inventados:
  // si aún no hay ≥2 snapshots, se muestra un estado honesto en vez del gráfico.
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

  // 0 no es ni positivo ni negativo: sin signo y en neutro. Los agregados (netWorth,
  // totalAssets…) YA vienen en la moneda de display (getRichLifeSummary los normaliza con
  // getPortfolioMarketValues + rates) → se muestran en crudo, sin reconvertir.
  const nw = ind.netWorth;
  const nwDir = nw > 0 ? 1 : nw < 0 ? -1 : 0;
  const vel = ind.wealthVelocity;
  const velDir = vel == null ? 0 : vel > 0 ? 1 : vel < 0 ? -1 : 0;
  const score = snapshot.score;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" home eyebrow="Crecimiento" title="Patrimonio" />

        {/* Resumen: patrimonio neto (rojo si es negativo) + el gráfico R5 como slot. */}
        <MSummaryCard
          eyebrow="Patrimonio neto total"
          // El signo lo pone el formateador central (−₡2.500.000, cero neutro). El positivo
          // no lleva "+": es un saldo, no un cambio.
          value={mAmount(nw, currency, 11)}
          tone={nwDir < 0 ? "danger" : "neutral"}
          chip={
            vel != null && velDir !== 0 ? (
              <MChip tone={velDir > 0 ? "success" : "danger"}>
                {velDir > 0 ? "+" : "−"}
                {mAmount(Math.abs(vel), currency, 7)} mes
              </MChip>
            ) : undefined
          }
          sub={
            nwDir < 0
              ? "Debes más de lo que tienes. Reducir pasivos es la prioridad."
              : `Lo que tienes (${formatMoney(ind.totalAssets, currency)}) menos lo que debes (${formatMoney(ind.totalLiabilities, currency)}).`
          }
          // Con menos de 2 puntos no hay línea que dibujar, pero callar deja el hero con un
          // hueco que parece un fallo de carga. Se dice lo que pasa —y que se arregla solo—
          // en vez de inventar una serie de ejemplo.
          slot={
            nwPoints.length >= 2 ? (
              <MScrubChart points={nwPoints} currency={currency} />
            ) : (
              <div
                className="muted"
                style={{ fontSize: 12, lineHeight: 1.5, textAlign: "center", padding: "10px 0" }}
              >
                Tu historial de patrimonio empieza hoy: la línea aparecerá conforme pasen los días.
              </div>
            )
          }
          style={{ marginBottom: 16 }}
        />

        {/* Métricas: balance + Rich Life Score + cuánto trabaja para ti. */}
        <MSectionHeader title="Tu patrimonio en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard label="Activos totales" value={mAmount(ind.totalAssets, currency, 8)} sub="lo que tienes" tone="success" />
          <MMetricCard label="Pasivos totales" value={mAmount(ind.totalLiabilities, currency, 8)} sub="lo que debes" tone="danger" />
          <MMetricCard
            label="Rich Life Score"
            value={String(Math.round(score.score))}
            sub={score.state}
          />
          <MMetricCard label="Invertido" value={mAmount(bd?.invested ?? 0, currency, 8)} sub="trabaja para ti" tone="success" />
        </MMetricGrid>

        {/* Composición — MDonut INTERACTIVO (R5): su lógica y props no se tocan. */}
        {slices.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Composición de activos" />
            <MDonut
              slices={slices}
              centerValue={formatCompact(ind.totalAssets, currency)}
              centerLabel="activos"
              currency={currency}
            />
          </div>
        )}

        {/* Activos y pasivos manuales — CRUD (FAB alta · SwipeRow editar/eliminar) */}
        <PatrimonioManager assets={assets} liabilities={liabilities} currency={currency} />
      </div>
    </div>
  );
}

