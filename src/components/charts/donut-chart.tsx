"use client";

import { PieChart, Pie, Cell } from "recharts";
import { DonutCenter } from "./donut-center";

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
  // Diámetro del hueco interior del aro (innerRadius = r * 0.68).
  const inner = size * 0.68;

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
          // Hueco CONSTANTE. `paddingAngle` se declara en GRADOS, así que el arco que deja
          // depende del radio: con 1,5° y esta dona medía 1,73 px por fuera y 1,18 por
          // dentro — y encogería más en una dona pequeña. Un trazo del color de la
          // superficie da 2 px reales en todo el borde, porque un trazo se mide en píxeles.
          //
          // El trazo va CENTRADO en el borde del sector (SVG no tiene `stroke-align`), así
          // que 2 px de trazo dejan 1 px por sector y 2 px de separación entre dos vecinos:
          // exactamente lo que se busca, sin que el hueco dependa del radio.
          paddingAngle={0}
          stroke="var(--surface)"
          strokeWidth={2}
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
          <DonutCenter
            value={centerLabel ?? ""}
            sub={centerSub}
            inner={inner}
            mode="number"
            valueClassName="num-xl"
            subClassName="donut-sub"
          />
        </div>
      )}
    </div>
  );
}
