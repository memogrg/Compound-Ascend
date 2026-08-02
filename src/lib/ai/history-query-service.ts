import "server-only";
/**
 * Puente entre `consultar_historial` y los snapshots. Elige la fuente según la métrica
 * y delega todo el cálculo al motor puro de `history-query.ts`.
 *
 * FUENTES y por qué:
 * - patrimonio → `net_worth_snapshots` (mensual): patrimonio NETO real —líquido +
 *   inversiones + activos − deudas—, escrito por el cron mensual y por las pantallas
 *   de patrimonio. Con FALLBACK a `portfolio_snapshots` mientras esa serie no tenga
 *   al menos dos puntos: para las cuentas viejas la tabla arranca vacía y responder
 *   "no tengo historial" teniendo snapshots de portafolio sería peor.
 * - portafolio → `portfolio_snapshots` (diario, con moneda propia). Se colapsa a
 *   mensual tomando el ÚLTIMO día de cada mes (valor de cierre).
 * - gasto / ingreso / ahorro → `monthly_snapshots` (ya mensual, uno por periodo).
 *
 * OJO con el fallback: `portfolio_snapshots.net_worth` es el patrimonio que había al
 * escribir la fila, no el valor de las inversiones —esa es `portfolio_value`—; sirve
 * como puente, pero la fuente autoritativa del patrimonio es `net_worth_snapshots`.
 *
 * Solo lectura, scope de hogar vía los servicios existentes (RLS por sesión).
 */
import {
  construirHistorial,
  colapsarAMensual,
  renderHistorial,
  type HistorialResult,
  type Metrica,
  type SeriePunto,
} from "@/lib/ai/history-query";

export type ConsultarHistorialPayload = HistorialResult & { resumen_md: string };

const METRICAS: Metrica[] = ["patrimonio", "portafolio", "gasto", "ingreso", "ahorro"];

/** Serie mensual de `monthly_snapshots` para las métricas de flujo. */
async function serieMensual(metrica: "gasto" | "ingreso" | "ahorro", meses: number): Promise<SeriePunto[]> {
  const { getSnapshotHistory } = await import("@/modules/financial-base/services/snapshot-service");
  // Se piden algunos más de los que se van a mostrar: el motor recorta al final, y así
  // un mes sin snapshot no deja la serie corta.
  const puntos = await getSnapshotHistory(Math.min(meses + 6, 60));
  return puntos.map((p) => ({
    periodo: p.period.slice(0, 7),
    valor:
      metrica === "gasto" ? p.realExpense
      : metrica === "ingreso" ? p.realIncome
      : p.freeCashflow,
  }));
}

/** Serie mensual de `portfolio_snapshots` (diario → cierre de mes) + su moneda. */
async function seriePortfolioSnapshots(
  metrica: "patrimonio" | "portafolio",
): Promise<{ serie: SeriePunto[]; moneda: string | null }> {
  const { getSnapshotHistory } = await import("@/modules/wealth/services/snapshot-service");
  const snaps = await getSnapshotHistory("all");
  const puntos = snaps.map((s) => ({
    fecha: s.date,
    valor: metrica === "patrimonio" ? s.netWorth : s.portfolioValue,
    moneda: s.currency ?? null,
  }));
  // Los snapshots traen su propia moneda; se usa la del más reciente (es la que el
  // motor de patrimonio estaba usando al escribirlos). La de CADA punto viaja aparte:
  // si el usuario cambió de moneda, la serie las cruza y el motor lo aclara.
  const moneda = snaps.length > 0 ? (snaps[snaps.length - 1]!.currency ?? null) : null;
  return { serie: colapsarAMensual(puntos), moneda };
}

/** Serie mensual de `net_worth_snapshots` (ya mensual) + la moneda con la que se escribió. */
async function serieNetWorthSnapshots(): Promise<{ serie: SeriePunto[]; moneda: string | null }> {
  const { getNetWorthHistory } = await import(
    "@/modules/rich-life/services/net-worth-snapshot-service"
  );
  const snaps = await getNetWorthHistory();
  // colapsarAMensual sobre datos ya mensuales es identidad + orden + dedupe: barato y
  // deja una sola forma de construir la serie.
  const serie = colapsarAMensual(
    snaps.map((s) => ({ fecha: s.period, valor: s.netWorth, moneda: s.currency })),
  );
  const moneda = snaps.length > 0 ? (snaps[snaps.length - 1]!.currency ?? null) : null;
  return { serie, moneda };
}

/**
 * Serie de patrimonio/portafolio. Para `patrimonio` manda `net_worth_snapshots`; si esa
 * serie todavía no da una tendencia (menos de 2 puntos) se cae a `portfolio_snapshots`
 * SOLO si aporta más puntos. Nunca se mezclan fuentes: sus valores no son comparables.
 */
async function seriePatrimonio(
  metrica: "patrimonio" | "portafolio",
): Promise<{ serie: SeriePunto[]; moneda: string | null }> {
  if (metrica === "portafolio") return seriePortfolioSnapshots(metrica);

  const nw = await serieNetWorthSnapshots();
  if (nw.serie.length >= 2) return nw;

  const pf = await seriePortfolioSnapshots(metrica);
  return pf.serie.length > nw.serie.length ? pf : nw;
}

/**
 * Ejecuta la consulta de historial. `moneda` es la de VISUALIZACIÓN; si la serie viene
 * de snapshots con moneda propia distinta, gana la del snapshot: los valores NO se
 * convierten (no hay tasa histórica por fecha, y convertir con la de hoy mentiría
 * sobre la evolución).
 *
 * Cuando el usuario cambió de moneda a mitad de la historia, la serie cruza dos: cada
 * punto lleva la suya y el motor lo detecta (`monedasMezcladas`) para aclararlo en vez
 * de restar unidades distintas.
 */
export async function consultarHistorial(
  args: Record<string, unknown>,
  moneda: string,
): Promise<ConsultarHistorialPayload> {
  const metricaArg = typeof args.metrica === "string" ? (args.metrica as Metrica) : null;
  const metrica: Metrica = metricaArg && METRICAS.includes(metricaArg) ? metricaArg : "patrimonio";
  const meses =
    typeof args.meses === "number" && Number.isFinite(args.meses) && args.meses > 0
      ? Math.min(Math.floor(args.meses), 60)
      : 6;

  let serie: SeriePunto[] = [];
  let monedaSerie = moneda;

  if (metrica === "patrimonio" || metrica === "portafolio") {
    const r = await seriePatrimonio(metrica);
    serie = r.serie;
    if (r.moneda) monedaSerie = r.moneda;
  } else {
    serie = await serieMensual(metrica, meses);
  }

  const resultado = construirHistorial(serie, { metrica, moneda: monedaSerie, meses });
  return { ...resultado, resumen_md: renderHistorial(resultado) };
}
