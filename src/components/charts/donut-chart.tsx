"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export type DonutDatum = { name: string; value: number; color: string };

/**
 * Donut reutilizable (Recharts). El color admite tokens CSS (var(--x)).
 * `centerLabel` se muestra en el centro del anillo.
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

  return (
    <div
      role="img"
      aria-label="Gráfico de dona: composición por categoría"
      style={{ position: "relative", width: size, height: size, flex: "none" }}
    >
      <div aria-hidden="true" style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={safe}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={1.5}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {safe.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
        </ResponsiveContainer>
      </div>
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
