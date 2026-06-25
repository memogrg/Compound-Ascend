"use client";

import { PieChart, Pie, Cell } from "recharts";

export type DonutDatum = { name: string; value: number; color: string };

/**
 * Donut reutilizable (Recharts). El color admite tokens CSS (var(--x)).
 * `centerLabel` se muestra en el centro del anillo.
 *
 * Nota: el donut tiene tamaño fijo (`size`), así que se renderiza con
 * `<PieChart width/height>` y radios NUMÉRICOS en vez de `ResponsiveContainer`
 * con radios en %. En Recharts 3 esa combinación (medición + animación) dejaba
 * el anillo sin dibujar (0 sectores); con tamaño explícito y `isAnimationActive
 * = false` el anillo se pinta de forma determinista.
 */
export function DonutChart({
  data,
  size = 132,
  centerLabel,
  centerSub,
}: {
  data: DonutDatum[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const safe =
    total > 0 ? data.filter((d) => d.value > 0) : [{ name: "—", value: 1, color: "var(--chip)" }];
  const r = size / 2;

  return (
    <div
      role="img"
      aria-label="Gráfico de dona: composición por categoría"
      style={{ position: "relative", width: size, height: size, flex: "none" }}
    >
      <PieChart width={size} height={size}>
        <Pie
          data={safe}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={r * 0.68}
          outerRadius={r}
          paddingAngle={1.5}
          stroke="none"
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
        >
          {safe.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
      {(centerLabel || centerSub) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div>
            {centerLabel ? (
              <div className="num-xl" style={{ fontSize: 18 }}>
                {centerLabel}
              </div>
            ) : null}
            {centerSub ? (
              <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                {centerSub}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
