"use client";

/**
 * Carga diferida de recharts: los charts montan tras la hidratación con un
 * skeleton del design system, sacando recharts del First Load JS de todas las
 * rutas. Los wrappers reales (line/donut/area) siguen siendo client — recharts
 * lo exige — este archivo solo mueve el peso fuera del bundle inicial.
 * Importar SIEMPRE los charts desde aquí, no desde los wrappers directos.
 */
import dynamic from "next/dynamic";

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <div className="skel" style={{ height, width: "100%" }} aria-hidden="true" />;
}

export const PremiumLineChart = dynamic(
  () => import("./line-chart").then((m) => m.PremiumLineChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const DonutChart = dynamic(() => import("./donut-chart").then((m) => m.DonutChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={240} />,
});

export const PerformanceChart = dynamic(
  () => import("./area-chart").then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export type { LineSeries } from "./line-chart";
export type { DonutDatum } from "./donut-chart";
export type { AreaPoint } from "./area-chart";
