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
import { ANIMACION_ACTIVA, aireParaRotuloFinal } from "./core";

/**
 * El tamaño del tick del eje X, en un solo sitio.
 *
 * Va acá y no se lee de `EJE` a propósito: el núcleo declara 11 px y este wrapper pinta 10,5
 * desde antes de la migración. Calcular el aire con 11 mientras se dibuja con 10,5 sería pedir
 * aire para un rótulo que no existe, y unificar el tamaño es un cambio de tipografía del eje —
 * no de recorte—, que es el delta 7, no este.
 */
const TAMANO_TICK = 10.5;

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
  /** El rótulo más largo del eje decide el aire: con uno solo basta mirar el último. */
  const rotuloFinal = String(data[data.length - 1]?.[xKey] ?? "");
  const aireDerecha = aireParaRotuloFinal(rotuloFinal, TAMANO_TICK, 8);

  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* `right` sale del ÚLTIMO rótulo, no de un número redondo: en escala de puntos el último
          tick cae sobre el borde del trazado y la mitad de la etiqueta se sale. Medido con
          «sep 2026» a 10,5 px: 51 px de ancho, 26 de los cuales sobresalen, contra los 8 px de
          margen que había — 18 px recortados. */}
      <LineChart
        data={data}
        margin={{ top: 8, right: aireDerecha, left: 0, bottom: 0 }}
        accessibilityLayer
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeOpacity={0.6}
          strokeDasharray="2 5"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "var(--muted)", fontSize: TAMANO_TICK, fontFamily: "var(--font-mono)" }}
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
