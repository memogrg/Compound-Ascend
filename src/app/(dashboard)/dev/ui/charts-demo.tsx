"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ANIMACION_ACTIVA,
  BARRA,
  ChartFrame,
  ChartTooltip,
  CROSSHAIR,
  EJE,
  GlowFilter,
  GradientDefs,
  Legend,
  PUNTO_ACTIVO,
  REJILLA,
  TRAZO,
  describirGrafico,
  niceDomain,
  opacidadDe,
  seriesVisibles,
  tablaDeDatos,
  useGlowId,
  useGradientIds,
  useSerieActiva,
  type SerieDef,
} from "@/components/charts/core";
import { formatAxisCompact, formatMoney } from "@/lib/format";

/**
 * Las tres muestras del núcleo de gráficos, sobre Recharts 3.
 *
 * Datos FIJOS y deterministas escritos acá: `/dev/ui` no lee de Supabase ni de ningún
 * servicio, así que el catálogo se ve igual en cualquier máquina y las capturas de QA no
 * dependen del estado de la demo.
 */
const MONEDA = "CRC";

const PATRIMONIO = [
  { x: "oct 25", neto: 28_450_000 },
  { x: "nov 25", neto: 29_120_000 },
  { x: "dic 25", neto: 28_900_000 },
  { x: "ene 26", neto: 30_310_000 },
  { x: "feb 26", neto: 31_040_000 },
  { x: "mar 26", neto: 30_780_000 },
  { x: "abr 26", neto: 32_100_000 },
  { x: "may 26", neto: 32_960_000 },
  { x: "jun 26", neto: 33_410_000 },
  { x: "jul 26", neto: 33_050_000 },
  { x: "ago 26", neto: 33_880_000 },
  { x: "sep 26", neto: 34_145_739 },
];
const SERIE_PATRIMONIO: SerieDef[] = [
  { clave: "neto", etiqueta: "Patrimonio neto", color: "var(--chart-1)", marca: "area" },
];

const FLUJO = [
  { x: "abr", real: 1_820_000, presupuesto: 1_900_000, proyeccion: null },
  { x: "may", real: 1_940_000, presupuesto: 1_900_000, proyeccion: null },
  { x: "jun", real: 1_760_000, presupuesto: 1_900_000, proyeccion: null },
  { x: "jul", real: 2_010_000, presupuesto: 1_950_000, proyeccion: null },
  { x: "ago", real: 1_880_000, presupuesto: 1_950_000, proyeccion: 1_880_000 },
  { x: "sep", real: null, presupuesto: 1_950_000, proyeccion: 1_930_000 },
  { x: "oct", real: null, presupuesto: 1_950_000, proyeccion: 1_975_000 },
];
const SERIES_FLUJO: SerieDef[] = [
  { clave: "real", etiqueta: "Real", color: "var(--chart-1)", marca: "linea" },
  { clave: "presupuesto", etiqueta: "Presupuesto", color: "var(--chart-3)", marca: "linea" },
  {
    clave: "proyeccion",
    etiqueta: "Proyección",
    color: "var(--chart-4)",
    marca: "linea",
    guion: true,
  },
];

const MESES = [
  { x: "abr", ingresos: 2_300_000, gastos: 1_820_000 },
  { x: "may", ingresos: 2_300_000, gastos: 1_940_000 },
  { x: "jun", ingresos: 2_450_000, gastos: 1_760_000 },
  { x: "jul", ingresos: 2_300_000, gastos: 2_010_000 },
  { x: "ago", ingresos: 2_520_000, gastos: 1_880_000 },
  { x: "sep", ingresos: 2_300_000, gastos: 1_690_000 },
];
const SERIES_MESES: SerieDef[] = [
  { clave: "ingresos", etiqueta: "Ingresos", color: "var(--chart-1)", marca: "barra" },
  { clave: "gastos", etiqueta: "Gastos", color: "var(--chart-5)", marca: "barra" },
];

/** Ejes y rejilla, iguales en las tres muestras: es lo que hace que se vean de la misma familia. */
function ejesComunes(data: readonly Record<string, unknown>[], claves: string[]) {
  const valores = data.flatMap((d) =>
    claves.map((k) => d[k]).filter((v): v is number => typeof v === "number"),
  );
  return niceDomain(valores);
}

const EJE_PROPS = {
  stroke: EJE.color,
  tick: { fill: EJE.color, fontSize: EJE.tamanoFuente },
  tickLine: false,
  axisLine: false,
} as const;

export function ChartsDemo() {
  return (
    <div style={{ display: "grid", gap: 26 }}>
      <AreaDemo />
      <LineaDemo />
      <BarrasDemo />
    </div>
  );
}

/** Área con degradado, glow en la serie activa y crosshair del tooltip. */
function AreaDemo() {
  const { estado, activar, desactivar, alternar } = useSerieActiva();
  const ids = useGradientIds(SERIE_PATRIMONIO);
  const glow = useGlowId();
  const visibles = seriesVisibles(SERIE_PATRIMONIO, estado);
  const dominio = ejesComunes(PATRIMONIO, ["neto"]);

  return (
    <ChartFrame
      titulo="Patrimonio neto"
      subtitulo="Área con degradado · glow en el punto activo · crosshair"
      descripcion={describirGrafico({
        titulo: "Patrimonio neto",
        serie: PATRIMONIO.map((d) => ({ x: d.x, y: d.neto })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={240}
      tabla={tablaDeDatos(PATRIMONIO, SERIE_PATRIMONIO, (v) => formatMoney(v, MONEDA), "Mes")}
      leyenda={
        <Legend
          series={SERIE_PATRIMONIO}
          estado={estado}
          onActivar={activar}
          onDesactivar={desactivar}
          onAlternar={alternar}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={PATRIMONIO}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <GradientDefs series={SERIE_PATRIMONIO} ids={ids} />
          <GlowFilter id={glow} />
          <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
          <XAxis dataKey="x" {...EJE_PROPS} />
          <YAxis
            {...EJE_PROPS}
            width={56}
            domain={dominio}
            tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
          />
          <Tooltip
            cursor={{
              stroke: CROSSHAIR.color,
              strokeWidth: CROSSHAIR.ancho,
              strokeDasharray: CROSSHAIR.patron,
            }}
            content={<ChartTooltip series={SERIE_PATRIMONIO} moneda={MONEDA} />}
          />
          {visibles.map((s) => (
            <Area
              key={s.clave}
              type="monotone"
              dataKey={s.clave}
              stroke={s.color}
              strokeWidth={TRAZO.ancho}
              strokeLinejoin={TRAZO.union}
              strokeLinecap={TRAZO.remate}
              fill={`url(#${ids[s.clave]})`}
              fillOpacity={1}
              opacity={opacidadDe(estado, s.clave)}
              isAnimationActive={ANIMACION_ACTIVA}
              activeDot={{
                r: PUNTO_ACTIVO.radio,
                fill: s.color,
                stroke: PUNTO_ACTIVO.anilloColor,
                strokeWidth: PUNTO_ACTIVO.anilloAncho,
                // El halo va SOLO en la serie activa: en todas deja de señalar nada.
                filter: estado.activa === s.clave ? `url(#${glow})` : undefined,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Tres series, con la proyección discontinua y la leyenda encendiendo y apagando. */
function LineaDemo() {
  const { estado, activar, desactivar, alternar } = useSerieActiva();
  const visibles = seriesVisibles(SERIES_FLUJO, estado);
  const dominio = ejesComunes(FLUJO, ["real", "presupuesto", "proyeccion"]);

  return (
    <ChartFrame
      titulo="Gasto del mes vs presupuesto"
      subtitulo="Tres series · leyenda interactiva · la proyección va discontinua"
      descripcion={describirGrafico({
        titulo: "Gasto real del mes",
        serie: FLUJO.map((d) => ({ x: d.x, y: d.real })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={240}
      tabla={tablaDeDatos(FLUJO, SERIES_FLUJO, (v) => formatMoney(v, MONEDA), "Mes")}
      leyenda={
        <Legend
          series={SERIES_FLUJO}
          estado={estado}
          onActivar={activar}
          onDesactivar={desactivar}
          onAlternar={alternar}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={FLUJO}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
          <XAxis dataKey="x" {...EJE_PROPS} />
          <YAxis
            {...EJE_PROPS}
            width={56}
            domain={dominio}
            tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
          />
          <Tooltip
            cursor={{
              stroke: CROSSHAIR.color,
              strokeWidth: CROSSHAIR.ancho,
              strokeDasharray: CROSSHAIR.patron,
            }}
            content={<ChartTooltip series={SERIES_FLUJO} moneda={MONEDA} />}
          />
          {visibles.map((s) => (
            <Line
              key={s.clave}
              type="monotone"
              dataKey={s.clave}
              stroke={s.color}
              strokeWidth={TRAZO.ancho}
              strokeLinejoin={TRAZO.union}
              strokeLinecap={TRAZO.remate}
              strokeDasharray={s.guion ? "5 4" : undefined}
              dot={false}
              connectNulls={false}
              opacity={opacidadDe(estado, s.clave)}
              isAnimationActive={ANIMACION_ACTIVA}
              activeDot={{
                r: PUNTO_ACTIVO.radio,
                fill: s.color,
                stroke: PUNTO_ACTIVO.anilloColor,
                strokeWidth: PUNTO_ACTIVO.anilloAncho,
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Barras mensuales: ancho tope, radio solo arriba y 2 px de aire entre pares. */
function BarrasDemo() {
  const { estado, activar, desactivar, alternar } = useSerieActiva();
  const visibles = seriesVisibles(SERIES_MESES, estado);
  const dominio = ejesComunes(MESES, ["ingresos", "gastos"]);

  return (
    <ChartFrame
      titulo="Ingresos y gastos por mes"
      subtitulo="Barras ≤ 24 px · radio solo en el extremo · 2 px entre barras"
      descripcion={describirGrafico({
        titulo: "Ingresos por mes",
        serie: MESES.map((d) => ({ x: d.x, y: d.ingresos })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={240}
      tabla={tablaDeDatos(MESES, SERIES_MESES, (v) => formatMoney(v, MONEDA), "Mes")}
      leyenda={
        <Legend
          series={SERIES_MESES}
          estado={estado}
          onActivar={activar}
          onDesactivar={desactivar}
          onAlternar={alternar}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={MESES}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barGap={BARRA.separacion}
          accessibilityLayer
        >
          <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
          <XAxis dataKey="x" {...EJE_PROPS} />
          <YAxis
            {...EJE_PROPS}
            width={56}
            domain={dominio}
            tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
          />
          <Tooltip
            cursor={{ fill: "var(--chip)" }}
            content={<ChartTooltip series={SERIES_MESES} moneda={MONEDA} />}
          />
          {visibles.map((s) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              fill={s.color}
              maxBarSize={BARRA.anchoMaximo}
              radius={[BARRA.radio, BARRA.radio, 0, 0]}
              opacity={opacidadDe(estado, s.clave)}
              isAnimationActive={ANIMACION_ACTIVA}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
