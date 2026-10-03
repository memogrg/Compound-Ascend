"use client";

/**
 * Gráfica de línea premium (Recharts): curvas suaves, ejes discretos, tooltip interactivo
 * (tap en móvil). Funciona en claro y oscuro (usa tokens CSS).
 *
 * Lo que este gráfico YA NO hace, porque es del marco (`ChartFrame`, 26.2):
 *
 *  - **Su leyenda.** La pintaba el `<Legend>` de Recharts dentro del lienzo, con
 *    `height={22}`: 22 px que le quitaba al trazado, sin poder seleccionarse ni alcanzarse con
 *    el teclado. Ahora va por el slot `leyenda` del marco (`LeyendaSeries`).
 *  - **Su estado vacío.** Devolvía `ChartEmpty` con menos de dos puntos. Los cuatro estados los
 *    decide el marco, que es el único que puede garantizar que midan lo mismo.
 *  - **Su `role="img"` y su `aria-label`.** El marco nombra la figura con `descripcion`, que
 *    dice el rango y el último valor; «Gráfico de líneas: evolución en el tiempo» encima de eso
 *    era ruido. Y el `aria-hidden` del envoltorio interior se va con él: un elemento focalizable
 *    dentro de un `aria-hidden` es la violación `aria-hidden-focus`, que es justo lo que
 *    `accessibilityLayer` iba a provocar.
 *
 * `accessibilityLayer` es lo que hace verdad lo que el marco promete: recorrer el gráfico con
 * las flechas.
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
import { niceEscala } from "./scale";
import { ANIMACION_ACTIVA } from "./core";

export type LineSeries = { key: string; label: string; color: string; dashed?: boolean };

type Datum = Record<string, number | string>;

export function PremiumLineChart({
  data,
  xKey,
  series,
  currency = "CRC",
}: {
  data: Datum[];
  xKey: string;
  series: LineSeries[];
  currency?: string;
}) {
  const values = data.flatMap((d) =>
    series.map((s) => Number(d[s.key])).filter((v) => Number.isFinite(v)),
  );
  const escala = niceEscala(values, { symmetric: true, ticks: 5 });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
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
          domain={escala.dominio}
          ticks={escala.ticks}
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
            isAnimationActive={ANIMACION_ACTIVA}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
