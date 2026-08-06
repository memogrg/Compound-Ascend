"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatMoney, formatAxisCompact } from "@/lib/format";
import { niceDomain } from "./scale";
import { ChartEmpty } from "./chart-empty";

export type AreaPoint = { date: string; value: number };

/** Nivel de ejes: `full` (gráficas grandes) · `compact` (sparklines, suave) · `none`. */
type AxesLevel = "full" | "compact" | "none";

interface PerformanceChartProps {
  data: AreaPoint[];
  currency: string;
  costBasis?: number;
  /** Formateador del valor en el tooltip. Por defecto: moneda. Útil para % o índices. */
  formatValue?: (value: number) => string;
  /** Fuerza el color de la curva (por defecto se decide por el signo del periodo). */
  tone?: "pos" | "neg";
  /** Línea de meta punteada (valor objetivo), además del costBasis. */
  goalValue?: number;
  /** Alto del gráfico en px (por defecto 120). */
  height?: number;
  /** Nivel de ejes (por defecto `compact`: incluso los sparklines llevan referencia suave). */
  axes?: AxesLevel;
}

const TICK = { fontFamily: "var(--font-mono)" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Etiqueta de eje X legible: ISO (YYYY-MM-DD) → "mmm aa"; el resto se deja igual. */
function axisDateLabel(v: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(v);
  if (!m) return v;
  return `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]!.slice(2)}`;
}

export function PerformanceChart({
  data,
  currency,
  costBasis,
  formatValue,
  tone,
  goalValue,
  height = 120,
  axes = "compact",
}: PerformanceChartProps) {
  const fmt = formatValue ?? ((v: number) => formatMoney(v, currency));
  const fmtTick = formatValue ?? ((v: number) => formatAxisCompact(v, currency));
  const reactId = useId();
  if (data.length < 2) {
    return (
      <ChartEmpty message="No hay suficiente historial para mostrar la gráfica." height={height} />
    );
  }

  const last = data[data.length - 1]?.value ?? 0;
  const first = data[0]?.value ?? 0;
  const positive = tone ? tone === "pos" : last >= first;
  const color = positive ? "var(--pos)" : "var(--neg)";
  const gradId = `pg-${currency}-${reactId.replace(/:/g, "")}`;

  const showAxes = axes !== "none";
  const full = axes === "full";
  const yTicks = full ? 5 : 3;
  const values = data.map((d) => d.value);
  if (costBasis !== undefined) values.push(costBasis);
  if (goalValue !== undefined) values.push(goalValue);
  const domain = niceDomain(values, {
    symmetric: true,
    ticks: yTicks,
    paddingRatio: full ? 0 : 0.06,
  });
  // Etiqueta discreta para una línea de referencia (p. ej. "presupuesto").
  const refLabel = (text: string) => ({
    value: text,
    position: "insideTopRight" as const,
    fill: "var(--muted)",
    fontSize: 9.5,
    fontFamily: "var(--font-mono)",
  });

  return (
    <div role="img" aria-label="Gráfico de área: rendimiento">
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
            margin={{ top: 6, right: full ? 8 : 4, left: 0, bottom: showAxes ? 2 : 0 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {showAxes && (
              <CartesianGrid
                stroke="var(--border)"
                strokeOpacity={0.6}
                strokeDasharray="2 5"
                vertical={false}
              />
            )}
            {/* Eje Y con ETIQUETAS solo en gráficas grandes (`full`). Los sparklines compactos
                llevan el mismo dominio (con padding) pero OCULTO: así la línea no toca los bordes
                y no se pinta un eje angosto que solo se parte ("163,3 mil"). El número grande de
                la card ya da la magnitud. */}
            {full ? (
              <YAxis
                domain={domain}
                width={48}
                tickCount={yTicks}
                tick={{ ...TICK, fill: "var(--muted)", fontSize: 10.5 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => fmtTick(Number(v))}
              />
            ) : (
              <YAxis domain={domain} hide />
            )}
            {showAxes && (
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                minTickGap={full ? 24 : 60}
                tick={{ ...TICK, fill: "var(--muted)", fontSize: full ? 10.5 : 9.5 }}
                axisLine={false}
                tickLine={false}
                dy={4}
                // Padding para que las etiquetas de los extremos ("Inicio"/"Hoy") NO se
                // recorten: en compact no hay eje Y que dé aire a la izquierda, así que la
                // primera etiqueta se centraba en x≈0 y se cortaba ("nicio"). Insetar los
                // ticks las deja completas y de paso la línea respira (se ve intencional).
                padding={{ left: full ? 0 : 16, right: full ? 4 : 14 }}
                tickFormatter={axisDateLabel}
              />
            )}
            {!showAxes && <XAxis dataKey="date" hide />}
            {goalValue !== undefined && (
              <ReferenceLine
                y={goalValue}
                stroke="var(--muted-2)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={showAxes ? refLabel("presupuesto") : undefined}
              />
            )}
            {costBasis !== undefined && (
              <ReferenceLine
                y={costBasis}
                stroke="var(--muted-2)"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={showAxes ? refLabel("base") : undefined}
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
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--ink)",
                border: "none",
                borderRadius: 8,
                color: "var(--bg)",
                fontSize: 12,
                padding: "6px 10px",
              }}
              formatter={(v) => [fmt(Number(v)), ""]}
              labelFormatter={(l) => l}
              labelStyle={{ color: "var(--muted-2)", fontSize: 11, marginBottom: 2 }}
              cursor={{ stroke: "var(--muted-2)", strokeWidth: 1 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
