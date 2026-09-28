"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
} from "recharts";

import { Sparkline } from "@/components/kpi";
import { DonutConLeyenda } from "@/components/charts/lazy";
import {
  BARRA,
  CalendarioGasto,
  ChartFrame,
  EJE,
  HistoricoGasto,
  TRAZO,
  describirGrafico,
  tablaDeDatos,
  type EstadoGrafico,
  type SerieDef,
} from "@/components/charts/core";
import { formatMoney } from "@/lib/format";

import { LienzoCatalogo } from "./controles-catalogo";

/**
 * La matriz de ESTADOS de los gráficos (delta 2.6b), sobre el marco de verdad.
 *
 * Se apoya en `ChartFrame`, que ya tiene los cuatro estados —datos, vacío, cargando, error— con
 * **la misma altura** en los cuatro, la tabla accesible y el foco de teclado. Escribir acá un
 * envoltorio de estados paralelo habría sido duplicar, peor, algo que ya existe y está probado:
 * el primer intento de esta sección hizo exactamente eso y se borró.
 *
 * Los cuatro estados que `ChartFrame` NO cubre —negativos, miles de millones, rótulos largos y
 * período en curso— no son estados de la consulta sino de los DATOS, así que se muestran con
 * datos de verdad que los provocan.
 *
 * Todo es constante y local: esta página no lee ni escribe nada.
 */

const MONEDA = "CRC";

const SERIE = [
  { x: "2026-01", v: 820_000 },
  { x: "2026-02", v: 910_000 },
  { x: "2026-03", v: 875_000 },
  { x: "2026-04", v: 1_040_000 },
  { x: "2026-05", v: 990_000 },
  { x: "2026-06", v: 1_120_000 },
];

const SERIE_NEG = SERIE.map((d, i) => ({ ...d, v: i % 2 === 0 ? -d.v : d.v / 3 }));
const SERIE_GIGA = SERIE.map((d) => ({ ...d, v: d.v * 12_000 }));

const SERIES: SerieDef[] = [
  { clave: "v", etiqueta: "Gasto", color: "var(--chart-3)", marca: "linea" },
];
const SERIES_ROTULO_LARGO: SerieDef[] = [
  {
    clave: "v",
    etiqueta: "Aporte mensual al fondo de emergencia de la familia (revisión trimestral)",
    color: "var(--chart-3)",
    marca: "linea",
  },
];

const DONA = [
  { name: "Esencial", value: 540_000, color: "var(--chart-3)" },
  { name: "Estilo de vida", value: 310_000, color: "var(--chart-4)" },
  { name: "Deudas", value: 220_000, color: "var(--chart-5)" },
];

const COLUMNAS = [
  { label: "abr", real: 1_040_000, presupuesto: 1_100_000 },
  { label: "may", real: 990_000, presupuesto: 1_100_000 },
  { label: "jun", real: 1_320_000, presupuesto: 1_100_000 },
];

const DIAS_CAL = Array.from({ length: 18 }, (_, i) => ({
  fecha: `2026-06-${String(i + 1).padStart(2, "0")}`,
  monto: [0, 12_000, 4_500, 38_000, 0, 21_000, 6_000][i % 7] ?? 0,
}));

/** Los cuatro estados de la CONSULTA, que `ChartFrame` resuelve solo. */
const ESTADOS_CONSULTA: readonly { nombre: string; estado: EstadoGrafico }[] = [
  { nombre: "con datos", estado: "datos" },
  { nombre: "vacío", estado: "vacio" },
  { nombre: "cargando", estado: "cargando" },
  { nombre: "error", estado: "error" },
];

function Estado({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="du-estado" data-estado={nombre}>
      <p className="du-estado-rotulo">{nombre}</p>
      <div className="du-estado-caja">{children}</div>
    </div>
  );
}

function Entrada({
  id,
  titulo,
  nota,
  spec,
  children,
}: {
  id: string;
  titulo: string;
  nota: string;
  spec: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="du-entrada" style={{ scrollMarginTop: 80 }}>
      <div className="du-entrada-cab">
        <h3 className="du-entrada-tit">
          <a href={`#${id}`} className="du-ancla" aria-label={`Enlace a ${titulo}`}>
            #
          </a>{" "}
          {titulo}
        </h3>
        <details className="du-spec">
          <summary aria-label={`Especificación de ${titulo}`}>?</summary>
          <p>{spec}</p>
        </details>
      </div>
      <p className="du-entrada-nota">{nota}</p>
      <div className="du-matriz du-matriz-ancha">{children}</div>
    </section>
  );
}

/** Un gráfico de línea dentro del marco, con el estado que se le pida. */
function Linea({
  estado,
  datos = SERIE,
  series = SERIES,
  titulo = "Gasto por mes",
}: {
  estado: EstadoGrafico;
  datos?: typeof SERIE;
  series?: SerieDef[];
  titulo?: string;
}) {
  return (
    <ChartFrame
      titulo={titulo}
      alto={140}
      estado={estado}
      descripcion={describirGrafico({
        titulo,
        serie: datos.map((d) => ({ x: d.x, y: d.v })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      tabla={tablaDeDatos(datos, series, (v) => formatMoney(v, MONEDA), "Mes")}
    >
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={datos} accessibilityLayer>
          <XAxis dataKey="x" {...EJE} />
          {series.map((s) => (
            <Line key={s.clave} dataKey={s.clave} stroke={s.color} {...TRAZO} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function Area_({ estado, datos = SERIE }: { estado: EstadoGrafico; datos?: typeof SERIE }) {
  return (
    <ChartFrame
      titulo="Patrimonio"
      alto={140}
      estado={estado}
      descripcion={describirGrafico({
        titulo: "Patrimonio",
        serie: datos.map((d) => ({ x: d.x, y: d.v })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      tabla={tablaDeDatos(datos, SERIES, (v) => formatMoney(v, MONEDA), "Mes")}
    >
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={datos} accessibilityLayer>
          <XAxis dataKey="x" {...EJE} />
          <Area dataKey="v" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.18} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function Barras({
  estado,
  apiladas,
  datos = SERIE,
}: {
  estado: EstadoGrafico;
  apiladas?: boolean;
  datos?: typeof SERIE;
}) {
  const conDos = datos.map((d) => ({ ...d, w: Math.round(d.v * 0.45) }));
  const titulo = apiladas ? "Ingresos y gastos (apiladas)" : "Ingresos y gastos (agrupadas)";
  const series: SerieDef[] = [
    { clave: "v", etiqueta: "Gasto", color: "var(--chart-3)", marca: "linea" },
    { clave: "w", etiqueta: "Ahorro", color: "var(--chart-1)", marca: "barra" },
  ];
  return (
    <ChartFrame
      titulo={titulo}
      alto={140}
      estado={estado}
      descripcion={describirGrafico({
        titulo,
        serie: datos.map((d) => ({ x: d.x, y: d.v })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      tabla={tablaDeDatos(conDos, series, (v) => formatMoney(v, MONEDA), "Mes")}
    >
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={conDos} accessibilityLayer>
          <XAxis dataKey="x" {...EJE} />
          {series.map((s) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              fill={s.color}
              stackId={apiladas ? "a" : undefined}
              {...BARRA}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function GraficosEstadosDemo() {
  return (
    <LienzoCatalogo>
      <Entrada
        id="gr-linea"
        titulo="Línea"
        nota="Una magnitud que evoluciona. El eje arranca donde haga falta, no siempre en cero."
        spec="Los cuatro estados de la consulta los pone `ChartFrame` y ocupan la MISMA altura. El tooltip se fija con clic y se suelta con Escape; las flechas recorren los puntos (`accessibilityLayer`). La tabla de datos está siempre disponible con «Ver tabla»."
      >
        {ESTADOS_CONSULTA.map((e) => (
          <Estado key={e.nombre} nombre={e.nombre}>
            <Linea estado={e.estado} />
          </Estado>
        ))}
        <Estado nombre="negativos">
          <Linea estado="datos" datos={SERIE_NEG} />
        </Estado>
        <Estado nombre="miles de millones">
          <Linea estado="datos" datos={SERIE_GIGA} />
        </Estado>
        <Estado nombre="rótulo largo">
          <Linea
            estado="datos"
            series={SERIES_ROTULO_LARGO}
            titulo="Aporte mensual al fondo de emergencia de la familia (revisión trimestral acordada en enero)"
          />
        </Estado>
        <Estado nombre="período en curso">
          <Linea estado="datos" datos={SERIE.slice(0, 3)} />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-area"
        titulo="Área"
        nota="Como la línea, pero cuando el volumen acumulado dice algo. Nunca para comparar series."
        spec="El relleno es decorativo: el dato está en el trazo. Con dos series superpuestas el área engaña, así que para comparar van barras. Mismos cuatro estados de `ChartFrame`."
      >
        {ESTADOS_CONSULTA.map((e) => (
          <Estado key={e.nombre} nombre={e.nombre}>
            <Area_ estado={e.estado} />
          </Estado>
        ))}
        <Estado nombre="negativos">
          <Area_ estado="datos" datos={SERIE_NEG} />
        </Estado>
        <Estado nombre="miles de millones">
          <Area_ estado="datos" datos={SERIE_GIGA} />
        </Estado>
        <Estado nombre="rótulo largo">
          <Area_ estado="datos" />
        </Estado>
        <Estado nombre="período en curso">
          <Area_ estado="datos" datos={SERIE.slice(0, 3)} />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-barras-agrupadas"
        titulo="Barras agrupadas"
        nota="Comparar dos magnitudes mes a mes. Desde cero, siempre: una barra cortada miente."
        spec="`escalaBarras` fija el ancho por el contenedor medido, no con `maxBarSize` —que recorta después de colocar y deja hueco (#850)—. Dominio desde cero. El color es el de la serie, no el del puesto."
      >
        {ESTADOS_CONSULTA.map((e) => (
          <Estado key={e.nombre} nombre={e.nombre}>
            <Barras estado={e.estado} />
          </Estado>
        ))}
        <Estado nombre="negativos">
          <Barras estado="datos" datos={SERIE_NEG} />
        </Estado>
        <Estado nombre="miles de millones">
          <Barras estado="datos" datos={SERIE_GIGA} />
        </Estado>
        <Estado nombre="rótulo largo">
          <Barras estado="datos" />
        </Estado>
        <Estado nombre="período en curso">
          <Barras estado="datos" datos={SERIE.slice(0, 3)} />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-barras-apiladas"
        titulo="Barras apiladas"
        nota="Composición de un total. Solo si las partes suman ese total y nada más."
        spec="Apilar dos cosas que no suman un todo es el error clásico. El orden de las series es fijo, no por tamaño: si cambia entre meses, el ojo lee un movimiento que no existe."
      >
        {ESTADOS_CONSULTA.map((e) => (
          <Estado key={e.nombre} nombre={e.nombre}>
            <Barras estado={e.estado} apiladas />
          </Estado>
        ))}
        <Estado nombre="negativos">
          <Barras estado="datos" apiladas datos={SERIE_NEG} />
        </Estado>
        <Estado nombre="miles de millones">
          <Barras estado="datos" apiladas datos={SERIE_GIGA} />
        </Estado>
        <Estado nombre="rótulo largo">
          <Barras estado="datos" apiladas />
        </Estado>
        <Estado nombre="período en curso">
          <Barras estado="datos" apiladas datos={SERIE.slice(0, 3)} />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-dona"
        titulo="Dona"
        nota="Reparto de un total entre pocas categorías. Con más de seis, una lista se lee mejor."
        spec="Leyenda en dos modos (`taxonomia` conserva el orden; `lista` ordena por monto y pliega en «Otras N»). Los porcentajes salen de `repartoMayorResto`, así que suman 100 exacto. El color pertenece a la categoría, nunca a su puesto en el ranking."
      >
        <Estado nombre="con datos">
          <DonutConLeyenda data={DONA} currency={MONEDA} centerLabel="₡1,07 M" vacio="Sin datos." />
        </Estado>
        <Estado nombre="vacío">
          <DonutConLeyenda
            data={[]}
            currency={MONEDA}
            vacio="Agregá tu presupuesto y acá vas a ver el reparto."
          />
        </Estado>
        <Estado nombre="cargando">
          <div className="skel" style={{ height: 240, width: "100%", borderRadius: 10 }} />
        </Estado>
        <Estado nombre="error">
          <DonutConLeyenda data={[]} currency={MONEDA} vacio="No se pudo cargar el reparto." />
        </Estado>
        <Estado nombre="negativos">
          <DonutConLeyenda
            data={[{ name: "Reintegro", value: -84_000, color: "var(--chart-5)" }, ...DONA]}
            currency={MONEDA}
            vacio="Sin datos."
          />
        </Estado>
        <Estado nombre="miles de millones">
          <DonutConLeyenda
            data={DONA.map((d) => ({ ...d, value: d.value * 12_000 }))}
            currency={MONEDA}
            vacio="Sin datos."
          />
        </Estado>
        <Estado nombre="rótulo largo">
          <DonutConLeyenda
            data={[
              {
                name: "Aporte mensual al fondo de emergencia de la familia (revisión trimestral)",
                value: 540_000,
                color: "var(--chart-3)",
              },
              ...DONA.slice(1),
            ]}
            currency={MONEDA}
            vacio="Sin datos."
          />
        </Estado>
        <Estado nombre="período en curso">
          <DonutConLeyenda
            data={DONA}
            currency={MONEDA}
            centerSub="del mes en curso"
            vacio="Sin datos."
          />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-columnas"
        titulo="Columnas con marca de presupuesto"
        nota="Gasto real contra lo presupuestado, mes a mes. La parte sobre la marca va en tono pleno."
        spec="La columna se parte: dentro del presupuesto en el tono claro de la rampa, el exceso en el pleno. El mes en curso lleva contorno discontinuo y su mensaje dice cuánto queda por día. El tono no es el único canal: el contorno y el texto lo dicen también."
      >
        <Estado nombre="con datos">
          <HistoricoGasto datos={COLUMNAS} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="vacío">
          <HistoricoGasto datos={[]} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="cargando">
          <div className="skel" style={{ height: 150, width: "100%", borderRadius: 10 }} />
        </Estado>
        <Estado nombre="error">
          <p className="du-vacio">No se pudo cargar el histórico.</p>
        </Estado>
        <Estado nombre="negativos">
          <HistoricoGasto
            datos={COLUMNAS.map((c) => ({ ...c, real: -c.real }))}
            moneda={MONEDA}
            alto={150}
          />
        </Estado>
        <Estado nombre="miles de millones">
          <HistoricoGasto
            datos={COLUMNAS.map((c) => ({
              ...c,
              real: c.real * 12_000,
              presupuesto: c.presupuesto * 12_000,
            }))}
            moneda={MONEDA}
            alto={150}
          />
        </Estado>
        <Estado nombre="rótulo largo">
          <HistoricoGasto datos={COLUMNAS} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="período en curso">
          <HistoricoGasto
            datos={COLUMNAS}
            moneda={MONEDA}
            alto={150}
            enCurso={{ dia: 18, diasDelMes: 30 }}
          />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-calendario"
        titulo="Calendario"
        nota="Gasto día a día dentro de un mes. Los días futuros se pintan como futuros, no como ceros."
        spec="Rejilla del mes real. Se navega con las flechas y se fija un día con Enter; Escape lo suelta. Un día sin gasto y un día futuro NO se pintan igual: cero es un dato, futuro es la ausencia de dato."
      >
        <Estado nombre="con datos">
          <CalendarioGasto anio={2026} mes={6} dias={DIAS_CAL} moneda={MONEDA} hoy="2026-06-18" />
        </Estado>
        <Estado nombre="vacío">
          <CalendarioGasto anio={2026} mes={6} dias={[]} moneda={MONEDA} hoy="2026-06-18" />
        </Estado>
        <Estado nombre="cargando">
          <div className="skel" style={{ height: 180, width: "100%", borderRadius: 10 }} />
        </Estado>
        <Estado nombre="error">
          <p className="du-vacio">No se pudo cargar el calendario.</p>
        </Estado>
        <Estado nombre="negativos">
          <CalendarioGasto
            anio={2026}
            mes={6}
            dias={DIAS_CAL.map((d, i) => (i === 3 ? { ...d, monto: -38_000 } : d))}
            moneda={MONEDA}
            hoy="2026-06-18"
          />
        </Estado>
        <Estado nombre="miles de millones">
          <CalendarioGasto
            anio={2026}
            mes={6}
            dias={DIAS_CAL.map((d) => ({ ...d, monto: d.monto * 12_000 }))}
            moneda={MONEDA}
            hoy="2026-06-18"
          />
        </Estado>
        <Estado nombre="rótulo largo">
          <CalendarioGasto anio={2026} mes={6} dias={DIAS_CAL} moneda={MONEDA} hoy="2026-06-18" />
        </Estado>
        <Estado nombre="período en curso">
          <CalendarioGasto anio={2026} mes={6} dias={DIAS_CAL} moneda={MONEDA} hoy="2026-06-18" />
        </Estado>
      </Entrada>

      <Entrada
        id="gr-sparkline"
        titulo="Sparkline"
        nota="La forma de la tendencia al lado de una cifra. Sin ejes: si hacen falta, es un gráfico."
        spec="`aria-hidden`: el dato está en la cifra de al lado. Punto final marcado. Con menos de dos puntos no se dibuja, y su anfitrión la oculta mientras no haya dato."
      >
        <Estado nombre="con datos">
          <Sparkline puntos={SERIE.map((d) => d.v)} />
        </Estado>
        <Estado nombre="vacío">
          <Sparkline puntos={[]} />
        </Estado>
        <Estado nombre="cargando">
          <p className="du-vacio">No se pinta: una curva a medias es una tendencia falsa.</p>
        </Estado>
        <Estado nombre="error">
          <p className="du-vacio">No se pinta.</p>
        </Estado>
        <Estado nombre="negativos">
          <Sparkline puntos={SERIE_NEG.map((d) => d.v)} />
        </Estado>
        <Estado nombre="miles de millones">
          <Sparkline puntos={SERIE_GIGA.map((d) => d.v)} />
        </Estado>
        <Estado nombre="rótulo largo">
          <p className="du-vacio">No aplica: no lleva rótulo.</p>
        </Estado>
        <Estado nombre="período en curso">
          <Sparkline puntos={SERIE.slice(0, 3).map((d) => d.v)} />
        </Estado>
      </Entrada>
    </LienzoCatalogo>
  );
}
