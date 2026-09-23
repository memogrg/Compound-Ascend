"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CROSSHAIR_FIJO,
  EJE,
  GlowFilter,
  GradientDefs,
  Legend,
  PUNTO_ACTIVO,
  REJILLA,
  SYNC_METHOD,
  TRAZO,
  describirGrafico,
  dominioBarras,
  formatoEjeX,
  niceDomain,
  opacidadDe,
  posicionAnclada,
  seriesVisibles,
  tablaDeDatos,
  useGlowId,
  useGradientIds,
  useSerieActiva,
  type SerieDef,
} from "@/components/charts/core";
import { formatAxisCompact, formatMoney } from "@/lib/format";

/**
 * Las muestras del núcleo de gráficos, sobre Recharts 3.
 *
 * Datos FIJOS y deterministas escritos acá: `/dev/ui` no lee de Supabase ni de ningún
 * servicio, así que el catálogo se ve igual en cualquier máquina y las capturas de QA no
 * dependen del estado de la demo.
 *
 * Las etiquetas del eje X van en ISO (`2026-04`) y se formatean con `formatoEjeX`: es lo que
 * permite que `syncMethod="value"` empareje dos gráficos por el MES y no por la posición.
 */
const MONEDA = "CRC";
const GRUPO = "dev-ui-periodo";

const PATRIMONIO = [
  { x: "2025-10", neto: 28_450_000 },
  { x: "2025-11", neto: 29_120_000 },
  { x: "2025-12", neto: 28_900_000 },
  { x: "2026-01", neto: 30_310_000 },
  { x: "2026-02", neto: 31_040_000 },
  { x: "2026-03", neto: 30_780_000 },
  { x: "2026-04", neto: 32_100_000 },
  { x: "2026-05", neto: 32_960_000 },
  { x: "2026-06", neto: 33_410_000 },
  { x: "2026-07", neto: 33_050_000 },
  { x: "2026-08", neto: 33_880_000 },
  { x: "2026-09", neto: 34_145_739 },
];
const SERIE_PATRIMONIO: SerieDef[] = [
  {
    clave: "neto",
    etiqueta: "Patrimonio neto",
    color: "var(--chart-1)",
    marca: "area",
    sentidoBueno: "arriba",
  },
];

/**
 * Siete meses que SOLAPAN con los seis últimos de Patrimonio. `2026-10` no existe allá: el
 * par sincronizado tiene que mostrar tooltip donde hay dato y nada donde no lo hay.
 *
 * `*_comparar` es el valor del periodo de comparación, y `nota` una anotación del punto.
 */
const FLUJO = [
  { x: "2026-04", real: 1_820_000, real_comparar: 1_760_000, presupuesto: 1_900_000 },
  { x: "2026-05", real: 1_940_000, real_comparar: 1_820_000, presupuesto: 1_900_000 },
  { x: "2026-06", real: 1_760_000, real_comparar: 1_940_000, presupuesto: 1_900_000 },
  { x: "2026-07", real: 2_010_000, real_comparar: 1_760_000, presupuesto: 1_950_000 },
  {
    x: "2026-08",
    real: 1_880_000,
    real_comparar: 2_010_000,
    presupuesto: 1_950_000,
    proyeccion: 1_880_000,
    nota: "Incluye el aguinaldo de medio periodo",
  },
  { x: "2026-09", real: null, presupuesto: 1_950_000, proyeccion: 1_930_000 },
  { x: "2026-10", real: null, presupuesto: 1_950_000, proyeccion: 1_975_000 },
];
const SERIES_FLUJO: SerieDef[] = [
  {
    clave: "real",
    etiqueta: "Real",
    color: "var(--chart-1)",
    marca: "linea",
    sentidoBueno: "abajo",
  },
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
  { x: "2026-04", ingresos: 2_300_000, gastos: 1_820_000 },
  { x: "2026-05", ingresos: 2_300_000, gastos: 1_940_000 },
  { x: "2026-06", ingresos: 2_450_000, gastos: 1_760_000 },
  { x: "2026-07", ingresos: 2_300_000, gastos: 2_010_000 },
  { x: "2026-08", ingresos: 2_520_000, gastos: 1_880_000 },
  { x: "2026-09", ingresos: 2_300_000, gastos: 1_690_000 },
];
const SERIES_MESES: SerieDef[] = [
  {
    clave: "ingresos",
    etiqueta: "Ingresos",
    color: "var(--chart-1)",
    marca: "barra",
    sentidoBueno: "arriba",
  },
  {
    clave: "gastos",
    etiqueta: "Gastos",
    color: "var(--chart-5)",
    marca: "barra",
    sentidoBueno: "abajo",
  },
];

/** Seis sobres: la muestra del tope de 4 filas del tooltip. */
const SOBRES = [
  {
    x: "2026-07",
    super: 420_000,
    casa: 310_000,
    transporte: 145_000,
    salud: 90_000,
    ocio: 78_000,
    otros: 41_000,
  },
  {
    x: "2026-08",
    super: 455_000,
    casa: 310_000,
    transporte: 132_000,
    salud: 120_000,
    ocio: 96_000,
    otros: 38_000,
  },
  {
    x: "2026-09",
    super: 398_000,
    casa: 310_000,
    transporte: 151_000,
    salud: 64_000,
    ocio: 82_000,
    otros: 45_000,
  },
];
const SERIES_SOBRES: SerieDef[] = [
  { clave: "super", etiqueta: "Supermercado", color: "var(--chart-1)", marca: "linea" },
  { clave: "casa", etiqueta: "Casa", color: "var(--chart-2)", marca: "linea" },
  { clave: "transporte", etiqueta: "Transporte", color: "var(--chart-3)", marca: "linea" },
  { clave: "salud", etiqueta: "Salud", color: "var(--chart-4)", marca: "linea" },
  { clave: "ocio", etiqueta: "Ocio", color: "var(--chart-5)", marca: "linea" },
  { clave: "otros", etiqueta: "Otros", color: "var(--chart-6)", marca: "linea" },
];

const EJE_PROPS = {
  stroke: EJE.color,
  tick: { fill: EJE.color, fontSize: EJE.tamanoFuente },
  tickLine: false,
  axisLine: false,
} as const;

function dominioDe(data: readonly Record<string, unknown>[], claves: string[]) {
  return niceDomain(
    data.flatMap((d) => claves.map((k) => d[k]).filter((v): v is number => typeof v === "number")),
  );
}

/**
 * Lo compartido por las muestras interactivas: el punto fijado, el anuncio de `aria-live` y
 * el anclaje del tooltip en punteros gruesos.
 *
 * El anuncio sale SOLO en teclado. Con el ratón ya se ve el tooltip, y narrar cada punto al
 * pasar por encima convierte al lector de pantalla en ruido continuo — es la diferencia entre
 * una ayuda y una alarma.
 */
function useInteraccion() {
  const serie = useSerieActiva();
  const [porTeclado, setPorTeclado] = useState(false);
  const [anuncio, setAnuncio] = useState<string | null>(null);
  const [coordX, setCoordX] = useState(0);
  const [grueso, setGrueso] = useState(false);
  const anchoRef = useRef(0);

  // `matchMedia` tras montar: en el servidor no existe, y leerlo durante el render daría un
  // HTML distinto en servidor y cliente (#418).
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const aplicar = () => setGrueso(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  const indiceRef = useRef<number | null>(null);
  const alPunto = useCallback((texto: string | null, indice: number | null) => {
    setAnuncio(texto);
    // En un ref y no en estado: solo lo lee el handler de Enter, y guardarlo en estado
    // volvería a renderizar el gráfico en cada punto por el que pasa el ratón.
    indiceRef.current = indice;
  }, []);

  /** Props comunes del `<*Chart>`: fijado por clic y registro del modo de entrada. */
  const propsChart = {
    onClick: (estado: { activeTooltipIndex?: number | string | null }) => {
      // Recharts entrega el índice como CADENA («"4"»), no como número: su tipo interno es
      // `TooltipIndex = string | null` aunque la firma pública diga `number | TooltipIndex`.
      // Se convierte acá, en el borde, para que el estado y su reductor sigan hablando de
      // números — que es lo que son. Con `typeof i === "number"` el clic no fijaba nada y el
      // fallo era mudo: el tooltip simplemente no se quedaba.
      const i = Number(estado?.activeTooltipIndex);
      if (Number.isInteger(i) && i >= 0) serie.fijar(i);
    },
    onMouseMove: (estado: { activeCoordinate?: { x?: number } | null }) => {
      const x = estado?.activeCoordinate?.x;
      if (typeof x === "number") setCoordX(x);
    },
  };

  /**
   * `position` del tooltip cuando el puntero es grueso: anclado ARRIBA del área de trazado.
   * Bajo el punto lo taparía el dedo justo cuando se quiere leer.
   */
  const position = grueso
    ? { x: posicionAnclada({ ancho: anchoRef.current || 320, x: coordX }), y: 0 }
    : undefined;

  return {
    ...serie,
    anuncio: porTeclado ? anuncio : null,
    alPunto,
    propsChart,
    position,
    anchoRef,
    // Handlers del contenedor: distinguen teclado de ratón sin preguntárselo a nadie.
    propsContenedor: {
      onKeyDownCapture: (e: React.KeyboardEvent) => {
        setPorTeclado(true);
        // Enter fija lo que el teclado está señalando: el equivalente del clic. Sin esto,
        // quien navega con teclado puede recorrer el gráfico pero no clavar un punto para
        // leerlo con calma.
        if (e.key === "Enter" && indiceRef.current !== null) {
          e.preventDefault();
          serie.fijar(indiceRef.current);
        }
      },
      onPointerMoveCapture: () => setPorTeclado(false),
    },
  };
}

/** El cursor del crosshair: punteado mientras sigue al ratón, sólido cuando está clavado. */
function cursorDe(fijado: number | null) {
  const c = fijado === null ? CROSSHAIR : CROSSHAIR_FIJO;
  return { stroke: c.color, strokeWidth: c.ancho, strokeDasharray: c.patron };
}

export function ChartsDemo() {
  return (
    <div style={{ display: "grid", gap: 26 }}>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Probá: <strong>clic</strong> fija el tooltip · <strong>Esc</strong> lo suelta ·{" "}
        <strong>← →</strong> recorren los puntos con el teclado. Los dos primeros gráficos comparten
        periodo: el crosshair de uno mueve el del otro.
      </p>
      <AreaDemo />
      <LineaDemo />
      <BarrasDemo />
      <SobresDemo />
    </div>
  );
}

/** Área sincronizada con la de abajo, con degradado y glow en el punto activo. */
function AreaDemo() {
  const it = useInteraccion();
  const ids = useGradientIds(SERIE_PATRIMONIO);
  const glow = useGlowId();
  const visibles = seriesVisibles(SERIE_PATRIMONIO, it.estado);

  return (
    <ChartFrame
      titulo="Patrimonio neto"
      subtitulo="12 meses · sincronizado con el gráfico de abajo · clic fija el tooltip"
      descripcion={describirGrafico({
        titulo: "Patrimonio neto",
        serie: PATRIMONIO.map((d) => ({ x: formatoEjeX(d.x), y: d.neto })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={230}
      anuncio={it.anuncio}
      onSoltar={it.soltar}
      tabla={tablaDeDatos(
        PATRIMONIO.map((d) => ({ ...d, x: formatoEjeX(d.x) })),
        SERIE_PATRIMONIO,
        (v) => formatMoney(v, MONEDA),
        "Mes",
      )}
      leyenda={
        <Legend
          series={SERIE_PATRIMONIO}
          estado={it.estado}
          onActivar={it.activar}
          onDesactivar={it.desactivar}
          onAlternar={it.alternar}
        />
      }
    >
      <div {...it.propsContenedor} style={{ height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={PATRIMONIO}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            syncId={GRUPO}
            syncMethod={SYNC_METHOD}
            accessibilityLayer
            {...it.propsChart}
          >
            <GradientDefs series={SERIE_PATRIMONIO} ids={ids} />
            <GlowFilter id={glow} />
            <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
            <XAxis dataKey="x" {...EJE_PROPS} tickFormatter={formatoEjeX} />
            <YAxis
              {...EJE_PROPS}
              width={56}
              domain={dominioDe(PATRIMONIO, ["neto"])}
              tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
            />
            <Tooltip
              cursor={cursorDe(it.estado.fijado)}
              position={it.position}
              // `active` controlado SOLO cuando hay algo fijado: con `undefined` manda
              // Recharts, que es quien sabe de hover y de teclado.
              active={it.estado.fijado !== null ? true : undefined}
              defaultIndex={it.estado.fijado ?? undefined}
              content={
                <ChartTooltip series={SERIE_PATRIMONIO} moneda={MONEDA} onPunto={it.alPunto} />
              }
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
                opacity={opacidadDe(it.estado, s.clave)}
                isAnimationActive={ANIMACION_ACTIVA}
                activeDot={{
                  r: PUNTO_ACTIVO.radio,
                  fill: s.color,
                  stroke: PUNTO_ACTIVO.anilloColor,
                  strokeWidth: PUNTO_ACTIVO.anilloAncho,
                  filter: it.estado.activa === s.clave ? `url(#${glow})` : undefined,
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Tres series, con delta vs comparación, una nota y la proyección discontinua. */
function LineaDemo() {
  const it = useInteraccion();
  const visibles = seriesVisibles(SERIES_FLUJO, it.estado);

  return (
    <ChartFrame
      titulo="Gasto del mes vs presupuesto"
      subtitulo="Delta vs el mes anterior · nota en agosto · la proyección va discontinua"
      descripcion={describirGrafico({
        titulo: "Gasto real del mes",
        serie: FLUJO.map((d) => ({ x: formatoEjeX(d.x), y: d.real })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={230}
      anuncio={it.anuncio}
      onSoltar={it.soltar}
      tabla={tablaDeDatos(
        FLUJO.map((d) => ({ ...d, x: formatoEjeX(d.x) })),
        SERIES_FLUJO,
        (v) => formatMoney(v, MONEDA),
        "Mes",
      )}
      leyenda={
        <Legend
          series={SERIES_FLUJO}
          estado={it.estado}
          onActivar={it.activar}
          onDesactivar={it.desactivar}
          onAlternar={it.alternar}
        />
      }
    >
      <div {...it.propsContenedor} style={{ height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={FLUJO}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            syncId={GRUPO}
            syncMethod={SYNC_METHOD}
            accessibilityLayer
            {...it.propsChart}
          >
            <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
            <XAxis dataKey="x" {...EJE_PROPS} tickFormatter={formatoEjeX} />
            <YAxis
              {...EJE_PROPS}
              width={56}
              domain={dominioDe(FLUJO, ["real", "presupuesto", "proyeccion"])}
              tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
            />
            <Tooltip
              cursor={cursorDe(it.estado.fijado)}
              position={it.position}
              active={it.estado.fijado !== null ? true : undefined}
              defaultIndex={it.estado.fijado ?? undefined}
              content={<ChartTooltip series={SERIES_FLUJO} moneda={MONEDA} onPunto={it.alPunto} />}
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
                opacity={opacidadDe(it.estado, s.clave)}
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
      </div>
    </ChartFrame>
  );
}

/** Barras desde cero, con separación dentro del mes y aire entre meses. */
function BarrasDemo() {
  const it = useInteraccion();
  const visibles = seriesVisibles(SERIES_MESES, it.estado);
  const dominio = useMemo(() => dominioBarras(MESES.flatMap((d) => [d.ingresos, d.gastos])), []);

  return (
    <ChartFrame
      titulo="Ingresos y gastos por mes"
      subtitulo="Desde cero · barras ≤ 24 px · 2 px dentro del mes y aire entre meses"
      descripcion={describirGrafico({
        titulo: "Ingresos por mes",
        serie: MESES.map((d) => ({ x: formatoEjeX(d.x), y: d.ingresos })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={230}
      anuncio={it.anuncio}
      onSoltar={it.soltar}
      tabla={tablaDeDatos(
        MESES.map((d) => ({ ...d, x: formatoEjeX(d.x) })),
        SERIES_MESES,
        (v) => formatMoney(v, MONEDA),
        "Mes",
      )}
      leyenda={
        <Legend
          series={SERIES_MESES}
          estado={it.estado}
          onActivar={it.activar}
          onDesactivar={it.desactivar}
          onAlternar={it.alternar}
        />
      }
    >
      <div {...it.propsContenedor} style={{ height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={MESES}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barGap={BARRA.separacion}
            barCategoryGap={BARRA.separacionCategoria}
            accessibilityLayer
            {...it.propsChart}
          >
            <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
            <XAxis dataKey="x" {...EJE_PROPS} tickFormatter={formatoEjeX} />
            <YAxis
              {...EJE_PROPS}
              width={56}
              domain={dominio}
              tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
            />
            <Tooltip
              cursor={{ fill: "var(--chip)" }}
              position={it.position}
              active={it.estado.fijado !== null ? true : undefined}
              defaultIndex={it.estado.fijado ?? undefined}
              content={<ChartTooltip series={SERIES_MESES} moneda={MONEDA} onPunto={it.alPunto} />}
            />
            {visibles.map((s) => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                fill={s.color}
                maxBarSize={BARRA.anchoMaximo}
                radius={[BARRA.radio, BARRA.radio, 0, 0]}
                opacity={opacidadDe(it.estado, s.clave)}
                isAnimationActive={ANIMACION_ACTIVA}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Seis series: el tooltip muestra las 4 de mayor peso y cuenta el resto. */
function SobresDemo() {
  const it = useInteraccion();
  const visibles = seriesVisibles(SERIES_SOBRES, it.estado);

  return (
    <ChartFrame
      titulo="Gasto por sobre"
      subtitulo="Seis series: el tooltip muestra las 4 de mayor peso y cuenta el resto"
      descripcion={describirGrafico({
        titulo: "Gasto por sobre",
        serie: SOBRES.map((d) => ({ x: formatoEjeX(d.x), y: d.super })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      alto={230}
      anuncio={it.anuncio}
      onSoltar={it.soltar}
      tabla={tablaDeDatos(
        SOBRES.map((d) => ({ ...d, x: formatoEjeX(d.x) })),
        SERIES_SOBRES,
        (v) => formatMoney(v, MONEDA),
        "Mes",
      )}
      leyenda={
        <Legend
          series={SERIES_SOBRES}
          estado={it.estado}
          onActivar={it.activar}
          onDesactivar={it.desactivar}
          onAlternar={it.alternar}
        />
      }
    >
      <div {...it.propsContenedor} style={{ height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={SOBRES}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            accessibilityLayer
            {...it.propsChart}
          >
            <CartesianGrid stroke={REJILLA.color} strokeWidth={REJILLA.ancho} vertical={false} />
            <XAxis dataKey="x" {...EJE_PROPS} tickFormatter={formatoEjeX} />
            <YAxis
              {...EJE_PROPS}
              width={56}
              domain={dominioDe(
                SOBRES,
                SERIES_SOBRES.map((s) => s.clave),
              )}
              tickFormatter={(v: number) => formatAxisCompact(v, MONEDA)}
            />
            <Tooltip
              cursor={cursorDe(it.estado.fijado)}
              position={it.position}
              active={it.estado.fijado !== null ? true : undefined}
              defaultIndex={it.estado.fijado ?? undefined}
              content={<ChartTooltip series={SERIES_SOBRES} moneda={MONEDA} onPunto={it.alPunto} />}
            />
            {visibles.map((s) => (
              <Line
                key={s.clave}
                type="monotone"
                dataKey={s.clave}
                stroke={s.color}
                strokeWidth={TRAZO.ancho}
                dot={false}
                opacity={opacidadDe(it.estado, s.clave)}
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
      </div>
    </ChartFrame>
  );
}
