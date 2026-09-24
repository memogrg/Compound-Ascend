"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

import {
  CalendarioGasto,
  ChartFrame,
  describirGrafico,
  formatoEjeX,
  recortar,
  tablaDeDatos,
  presetsUtiles,
  type DiaGasto,
  type RangoPreset,
} from "@/components/charts/core";
import { REJILLA, EJE, TRAZO, type SerieDef } from "@/components/charts/core/theme";
import { formatMoney } from "@/lib/format";

/**
 * Los dos deltas del 2.5, sin dependencias nuevas: el calendario de gasto y el zoom por
 * presets. Datos fijos — esta página no lee nada.
 */
const MONEDA = "CRC";

/** Septiembre de 2026, con el mes a medias: del 19 en adelante es futuro. */
const HOY = "2026-09-18";
const DIAS: DiaGasto[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(
  (d) => {
    // Patrón realista: fines de semana caros, un día grande a mitad de mes, tres días sin gasto.
    const dow = (d + 1) % 7; // 1-sep-2026 es martes
    const finde = dow === 5 || dow === 6;
    const sinGasto = [4, 11, 17].includes(d);
    const base = sinGasto ? 0 : finde ? 42_000 + d * 900 : 9_500 + d * 420;
    const pico = d === 15 ? 118_000 : 0;
    return {
      fecha: `2026-09-${String(d).padStart(2, "0")}`,
      monto: base + pico,
      movimientos: sinGasto ? 0 : finde ? 4 : 2,
    };
  },
);

/** 36 meses de patrimonio, para los presets. */
const PATRIMONIO = Array.from({ length: 36 }, (_, i) => ({
  x: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
  neto: 18_000_000 + i * 640_000 + (i % 5) * 180_000,
}));

const SERIE: SerieDef[] = [
  { clave: "neto", etiqueta: "Patrimonio neto", color: "var(--chart-1)", marca: "area" },
];

export function CalendarioDemo() {
  const [rango, setRango] = useState<RangoPreset>("1A");
  const [dia, setDia] = useState<DiaGasto | null>(null);

  const presets = useMemo(() => presetsUtiles(PATRIMONIO.length, ["6M", "1A", "2A", "Todo"]), []);
  const datos = useMemo(() => recortar(PATRIMONIO, rango), [rango]);

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <ChartFrame
        titulo="Gasto diario"
        subtitulo="Septiembre 2026 · flechas para moverse, Enter fija el día"
        descripcion={describirGrafico({
          titulo: "Gasto diario de septiembre",
          serie: DIAS.map((d) => ({ x: d.fecha, y: d.monto })),
          formato: (v) => formatMoney(v, MONEDA),
        })}
        alto={300}
        tabla={tablaDeDatos(
          DIAS.map((d) => ({ x: d.fecha, gasto: d.monto })),
          [{ clave: "gasto", etiqueta: "Gasto", color: "var(--chart-1)", marca: "area" }],
          (v) => formatMoney(v, MONEDA),
          "Día",
        )}
        anuncio={dia ? `${dia.fecha}: ${formatMoney(dia.monto, MONEDA)}` : null}
        onSoltar={() => setDia(null)}
      >
        <CalendarioGasto
          anio={2026}
          mes={9}
          dias={DIAS}
          moneda={MONEDA}
          hoy={HOY}
          onFijar={setDia}
        />
      </ChartFrame>

      <ChartFrame
        titulo="Patrimonio neto"
        subtitulo="36 meses · los chips recortan la serie, y la tabla los sigue"
        descripcion={describirGrafico({
          titulo: "Patrimonio neto",
          serie: datos.map((d) => ({ x: formatoEjeX(d.x), y: d.neto })),
          formato: (v) => formatMoney(v, MONEDA),
        })}
        alto={230}
        rangos={presets}
        rangoActivo={rango}
        onRango={setRango}
        tabla={tablaDeDatos(
          datos.map((d) => ({ ...d, x: formatoEjeX(d.x) })),
          SERIE,
          (v) => formatMoney(v, MONEDA),
          "Mes",
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={REJILLA.color}
              strokeDasharray={REJILLA.discontinua ? "3 3" : undefined}
              vertical={false}
            />
            <XAxis
              dataKey="x"
              tickFormatter={formatoEjeX}
              stroke={EJE.color}
              tick={{ fontSize: EJE.tamanoFuente }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Area
              type="monotone"
              dataKey="neto"
              stroke="var(--chart-1)"
              strokeWidth={TRAZO.ancho}
              fill="var(--chart-1)"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}
