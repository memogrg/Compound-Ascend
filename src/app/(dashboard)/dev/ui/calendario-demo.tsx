"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

import {
  CalendarioGasto,
  ChartFrame,
  describirGrafico,
  formatoEjeX,
  cuantiles,
  diaDeLaSemana,
  mesesHaciaAtras,
  nivelDe,
  niceDomain,
  recortar,
  tablaDeDatos,
  presetsUtiles,
  type DiaGasto,
  type RangoPreset,
} from "@/components/charts/core";
import { REJILLA, EJE, TRAZO, type SerieDef } from "@/components/charts/core/theme";
import { formatAxisCompact, formatMonthShort, formatMoney } from "@/lib/format";
import { currentPeriodInTz, todayISOInTz } from "@/lib/time/user-time-core";

/**
 * Los dos deltas del 2.5, sin dependencias nuevas: el calendario de gasto y el zoom por
 * presets. Datos fijos — esta página no lee nada.
 */
const MONEDA = "CRC";

/** El mes en curso, una sola vez: lo usan la rejilla y la serie de 36 meses. */
const AHORA = currentPeriodInTz("America/Costa_Rica");
const PERIODO_ACTUAL = `${AHORA.year}-${String(AHORA.month).padStart(2, "0")}`;

/**
 * El mes EN CURSO, a medias: hay gasto hasta hoy y de mañana en adelante es futuro.
 *
 * El mes y el día salen del reloj (congelado en la captura), no de constantes: con
 * "2026-09-18" escrito a mano la demo dejaba de tener días futuros en octubre, y el estado
 * «futuro» —que es justo lo que esta pantalla enseña— desaparecía sin que nada fallara.
 */
const HOY = PERIODO_ACTUAL;
const ANIO = AHORA.year;
const MES = AHORA.month;
const DIA_HOY = Number(todayISOInTz("America/Costa_Rica").slice(8, 10));
const FECHA_HOY = todayISOInTz("America/Costa_Rica");
const DIAS: DiaGasto[] = Array.from({ length: DIA_HOY }, (_, i) => i + 1).map((d) => {
  // Patrón realista: fines de semana caros, un día grande a mitad de mes, tres días sin gasto.
  const dow = diaDeLaSemana(ANIO, MES, d);
  const finde = dow === 5 || dow === 6;
  const sinGasto = [4, 11, 17].includes(d);
  const base = sinGasto ? 0 : finde ? 42_000 + d * 900 : 9_500 + d * 420;
  const pico = d === 15 ? 118_000 : 0;
  return {
    fecha: `${HOY}-${String(d).padStart(2, "0")}`,
    monto: base + pico,
    movimientos: sinGasto ? 0 : finde ? 4 : 2,
  };
});

/**
 * 36 meses de patrimonio CONTADOS HACIA ATRÁS desde el mes en curso, no hacia adelante
 * desde una fecha fija: así la serie nunca tiene puntos en el futuro y los presets («6M»,
 * «1A») recortan de verdad contra el presente. `currentPeriodInTz` es puro y respeta el
 * reloj congelado de la captura (`QA_FREEZE`), que es lo que hace la demo reproducible.
 */
const PATRIMONIO = mesesHaciaAtras(PERIODO_ACTUAL, 36).map((x, i) => ({
  x,
  neto: 18_000_000 + i * 640_000 + (i % 5) * 180_000,
}));

/** Los mismos cortes que usa la rejilla, para que la columna «Paso» no invente otros. */
const CORTES = cuantiles(
  DIAS.map((d) => d.monto),
  5,
);

const SERIE: SerieDef[] = [
  { clave: "neto", etiqueta: "Patrimonio neto", color: "var(--chart-1)", marca: "area" },
];

export function CalendarioDemo() {
  const [rango, setRango] = useState<RangoPreset>("1A");
  const [dia, setDia] = useState<DiaGasto | null>(null);

  const presets = useMemo(() => presetsUtiles(PATRIMONIO.length, ["6M", "1A", "2A", "Todo"]), []);
  const datos = useMemo(() => recortar(PATRIMONIO, rango), [rango]);
  // El dominio se recalcula sobre lo VISIBLE, no sobre los 36 meses: con el eje fijo al
  // total, «6M» pintaba una línea casi plana pegada al techo y el zoom no mostraba nada.
  const dominio = useMemo(() => niceDomain(datos.map((d) => d.neto)) as [number, number], [datos]);

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <ChartFrame
        titulo="Gasto diario"
        subtitulo={`${formatMonthShort(`${HOY}-01`)} · flechas para moverse, Enter fija el día`}
        descripcion={describirGrafico({
          titulo: "Gasto diario de septiembre",
          serie: DIAS.map((d) => ({ x: d.fecha, y: d.monto })),
          formato: (v) => formatMoney(v, MONEDA),
        })}
        alto={400}
        tabla={tablaDeDatos(
          // El PASO de la rampa va como columna: el color es el único canal que dice
          // «cuánto» en la rejilla, y quien no lo distingue —daltonismo, contraste bajo,
          // lector de pantalla— se quedaba sin esa información. WCAG 1.4.1.
          DIAS.map((d) => ({ x: d.fecha, gasto: d.monto, paso: nivelDe(d.monto, CORTES) + 1 })),
          [
            { clave: "gasto", etiqueta: "Gasto", color: "var(--chart-1)", marca: "area" },
            { clave: "paso", etiqueta: "Paso", color: "var(--chart-1)", marca: "area" },
          ],
          (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? String(v) : formatMoney(v, MONEDA)),
          "Día",
        )}
        anuncio={dia ? `${dia.fecha}: ${formatMoney(dia.monto, MONEDA)}` : null}
        onSoltar={() => setDia(null)}
      >
        <CalendarioGasto
          anio={ANIO}
          mes={MES}
          dias={DIAS}
          moneda={MONEDA}
          hoy={FECHA_HOY}
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
            {/* El eje Y VISIBLE: sin él, recortar el rango cambia la escala en silencio y
                dos capturas del mismo gráfico no son comparables. Compacto porque un
                ₡20.560.000 completo se come un tercio del ancho. */}
            <YAxis
              domain={dominio}
              tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
              stroke={EJE.color}
              tick={{ fontSize: EJE.tamanoFuente }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
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
