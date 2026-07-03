"use client";

/**
 * Gráfica de línea premium (Recharts): curvas suaves, ejes discretos, tooltip
 * interactivo (tap en móvil). Funciona en claro y oscuro (usa tokens CSS).
 * Soporta varias series (p. ej. real vs presupuesto) con leyenda compacta.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatMoney, formatCompact } from "@/lib/format";
import { niceDomain } from "./scale";
import { ChartEmpty } from "./chart-empty";

export type LineSeries = { key: string; label: string; color: string; dashed?: boolean };

type Datum = Record<string, number | string>;

export function PremiumLineChart({
  data,
  xKey,
  series,
  currency = "CRC",
  height = 240,
}: {
  data: Datum[];
  xKey: string;
  series: LineSeries[];
  currency?: string;
  height?: number;
}) {
  if (data.length < 2) {
    return <ChartEmpty message="No hay suficiente historial para mostrar la gráfica." height={height} />;
  }

  const values = data.flatMap((d) =>
    series.map((s) => Number(d[s.key])).filter((v) => Number.isFinite(v)),
  );
  const domain = niceDomain(values, { symmetric: true, ticks: 5 });

  return (
    <div role="img" aria-label="Gráfico de líneas: evolución en el tiempo">
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              stroke="var(--border)"
              strokeOpacity={0.6}
              strokeDasharray="2 5"
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              tick={{ fill: "var(--muted)", fontSize: 10.5, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              dy={6}
              minTickGap={24}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "var(--muted)", fontSize: 10.5, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickCount={5}
              tickFormatter={(v) => formatCompact(Number(v), currency)}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                boxShadow: "var(--shadow-float)",
                fontSize: 12.5,
              }}
              labelStyle={{ color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}
              formatter={(value, name) => [formatMoney(Number(value), currency), name]}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={22}
              iconType="plainline"
              iconSize={12}
              wrapperStyle={{ fontSize: 11, color: "var(--muted)", paddingBottom: 4 }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.4}
                strokeDasharray={s.dashed ? "5 5" : undefined}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
