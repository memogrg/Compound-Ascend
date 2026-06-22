"use client";

/**
 * Gráfica de línea premium (Recharts): curvas suaves, ejes discretos, tooltip
 * interactivo (tap en móvil), animación al cargar. Funciona en claro y oscuro
 * (usa tokens CSS). Soporta varias series (p. ej. real vs presupuesto).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney, formatCompact } from "@/lib/format";

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
  return (
    <div role="img" aria-label="Gráfico de líneas: evolución en el tiempo">
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
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
            animationDuration={650}
          />
        ))}
      </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
