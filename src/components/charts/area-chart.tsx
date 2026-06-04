"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatMoney } from "@/lib/format";

export type AreaPoint = { date: string; value: number };

interface PerformanceChartProps {
  data: AreaPoint[];
  currency: string;
  costBasis?: number;
  /** Formateador del valor en el tooltip. Por defecto: moneda. Útil para % o índices. */
  formatValue?: (value: number) => string;
}

export function PerformanceChart({ data, currency, costBasis, formatValue }: PerformanceChartProps) {
  const fmt = formatValue ?? ((v: number) => formatMoney(v, currency));
  const reactId = useId();
  if (data.length < 2) {
    return (
      <div
        style={{
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="muted" style={{ fontSize: 12.5 }}>
          No hay suficiente historial para mostrar la gráfica.
        </span>
      </div>
    );
  }

  const last = data[data.length - 1]?.value ?? 0;
  const first = data[0]?.value ?? 0;
  const positive = last >= first;
  const color = positive ? "var(--pos)" : "var(--neg)";
  const gradId = `pg-${currency}-${reactId.replace(/:/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {costBasis !== undefined && (
          <ReferenceLine
            y={costBasis}
            stroke="var(--muted-2)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.8}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
        <XAxis dataKey="date" hide />
        <Tooltip
          contentStyle={{
            background: "var(--ink)",
            border: "none",
            borderRadius: 8,
            color: "var(--bg)",
            fontSize: 12,
            padding: "6px 10px",
          }}
          formatter={(v: number) => [fmt(v), ""]}
          labelFormatter={(l: string) => l}
          labelStyle={{ color: "var(--muted-2)", fontSize: 11, marginBottom: 2 }}
          cursor={{ stroke: "var(--muted-2)", strokeWidth: 1 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
