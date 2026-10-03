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
import { DonutChart, DonutConLeyenda, type DonutDatum } from "@/components/charts/lazy";
import {
  BARRA,
  CalendarioGasto,
  ChartFrame,
  EJE,
  HistoricoGasto,
  LeyendaDona,
  LeyendaHistoricoGasto,
  TRAZO,
  anchoDeBarra,
  describirDona,
  describirGrafico,
  filasLeyenda,
  tablaDeDatos,
  tablaDona,
  useAncho,
  type EstadoGrafico,
  type ModoLeyenda,
  type SerieDef,
} from "@/components/charts/core";
import { formatCompact, formatMoney } from "@/lib/format";

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

/**
 * El histórico CON su leyenda, que es como se ve en producción.
 *
 * La leyenda y el rótulo del mes en curso salieron del gráfico (decisión 48): van por el slot
 * `leyenda` de `ChartFrame`, porque los children del marco viven en `.cf-lienzo`, que tiene
 * altura fija, y todo lo que el gráfico pintara debajo del trazado se salía de la tarjeta.
 *
 * Acá no hay marco —el catálogo enseña ESTADOS del gráfico, cada uno en su celda—, así que se
 * emparejan a mano. Si no, el catálogo mostraría un gráfico sin leyenda y nadie podría revisar
 * la leyenda, que es justo una de las cosas que cambian con los datos (`Exceso` y `Parcial` solo
 * aparecen cuando los hay).
 */
function HistoricoConLeyenda(props: React.ComponentProps<typeof HistoricoGasto>) {
  return (
    <>
      <HistoricoGasto {...props} />
      <LeyendaHistoricoGasto datos={props.datos} enCurso={props.enCurso} />
    </>
  );
}

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

/**
 * Un marco con los tres slots de 26.1, para poder verlos y medirlos.
 *
 * La leyenda es una lista cualquiera: el slot pinta lo que le den, y lo que se demuestra acá es el
 * REPARTO, no una leyenda concreta. La dona trae la suya en 26.3.
 */
/** El tamaño del anillo, el mismo que usa `DonutChart` por defecto y el que pasa el panel. */
const ANILLO_DEMO = 132;

/** Un reparto largo, para que `lista` tenga qué plegar en «Otras N». */
const DONA_LARGA = Array.from({ length: 11 }, (_, i) => ({
  name: `Categoría ${i + 1}`,
  value: (11 - i) * 90_000,
  color: `var(--chart-${(i % 6) + 1})`,
}));

/**
 * La dona dentro del marco: el camino que 26.3 estrena en `/dashboard`.
 *
 * Está acá con sus estados para que el catálogo no se quede diciendo solo lo que hacía el camino
 * viejo. Mientras los dos existan, los dos se muestran.
 */
function DonaEnMarco({
  modo,
  datos = DONA,
  estado,
}: {
  modo: ModoLeyenda;
  datos?: readonly DonutDatum[];
  estado?: EstadoGrafico;
}) {
  const titulo = modo === "lista" ? "Composición por categoría" : "Presupuesto del mes por bloque";
  const leyenda = filasLeyenda(datos, { modo });
  const dinero = (v: number) => formatMoney(v, MONEDA);
  const total = leyenda.filas.reduce((s, f) => s + f.value, 0);

  return (
    <ChartFrame
      titulo={titulo}
      alto={ANILLO_DEMO}
      ajustadoAlContenido
      estado={estado ?? (leyenda.filas.length === 0 ? "vacio" : "datos")}
      mensajeVacio="Agregá tu presupuesto y acá vas a ver el reparto."
      mensajeError="No se pudo cargar el reparto."
      descripcion={describirDona({ titulo, filas: leyenda.filas, formato: dinero })}
      tabla={tablaDona(leyenda, dinero, modo === "lista" ? "Categoría" : "Bloque")}
      disposicionLeyenda="lateral"
      leyenda={<LeyendaDona filas={leyenda.filas} ocultas={leyenda.ocultas} moneda={MONEDA} />}
      acciones={
        <a className="ghost-link" href="/mi-base-financiera">
          Detalle
        </a>
      }
    >
      <DonutChart
        data={leyenda.filas.map((f) => ({ name: f.name, value: f.value, color: f.color }))}
        size={ANILLO_DEMO}
        centerLabel={formatCompact(total, MONEDA)}
        centerSub="presupuesto"
      />
    </ChartFrame>
  );
}

function MarcoConSlots({ lateral, sinLeyenda }: { lateral?: boolean; sinLeyenda?: boolean }) {
  return (
    <ChartFrame
      titulo="Composición del mes"
      subtitulo="por bloque"
      alto={lateral ? 240 : 140}
      estado="datos"
      disposicionLeyenda={lateral ? "lateral" : "inferior"}
      descripcion={describirGrafico({
        titulo: "Composición del mes",
        serie: SERIE.map((d) => ({ x: d.x, y: d.v })),
        formato: (v) => formatMoney(v, MONEDA),
      })}
      tabla={tablaDeDatos(SERIE, SERIES, (v) => formatMoney(v, MONEDA), "Mes")}
      acciones={
        <a className="ghost-link" href="/mi-base-financiera">
          Detalle
        </a>
      }
      pie={<span>Los porcentajes se reparten por mayor resto, así que suman 100 exactos.</span>}
      leyenda={
        sinLeyenda ? undefined : (
          <ul className="cf-leyenda">
            {SERIES.map((se) => (
              <li key={se.clave}>
                <span className="cf-leyenda-btn">
                  <span
                    className="cf-swatch cf-swatch-bloque"
                    style={{ background: se.color }}
                    aria-hidden="true"
                  />
                  {se.etiqueta}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={SERIE} accessibilityLayer>
          <XAxis dataKey="x" {...EJE} />
          {SERIES.map((se) => (
            <Line key={se.clave} dataKey={se.clave} stroke={se.color} {...TRAZO} />
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

/** Lo que ocupa el eje Y: se descuenta del contenedor para medir el trazado real. */
const ANCHO_EJE_Y = 56;

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
  // El ancho de barra se CALCULA midiendo el contenedor, igual que en producción. Sin esto
  // Recharts reparte todo el ancho disponible entre las categorías y con tres meses salían
  // barras de 111 px — seis veces el tope de 24 que el design system declara, y justo lo
  // contrario de lo que promete la ficha de esta entrada. El catálogo existe para enseñar
  // lo que hace el núcleo, no una versión suya que se porta distinto.
  const [refAncho, anchoCaja] = useAncho<HTMLDivElement>();
  const anchoBarra = anchoDeBarra(Math.max(0, anchoCaja - ANCHO_EJE_Y), conDos.length, 2);
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
      <div ref={refAncho} style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart
            data={conDos}
            accessibilityLayer
            barGap={BARRA.separacion}
            barCategoryGap={BARRA.separacionCategoria}
            {...(anchoBarra > 0 ? { barSize: anchoBarra } : {})}
          >
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
      </div>
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
          <HistoricoConLeyenda datos={COLUMNAS} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="vacío">
          <HistoricoConLeyenda datos={[]} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="cargando">
          <div className="skel" style={{ height: 150, width: "100%", borderRadius: 10 }} />
        </Estado>
        <Estado nombre="error">
          <p className="du-vacio">No se pudo cargar el histórico.</p>
        </Estado>
        <Estado nombre="negativos">
          <HistoricoConLeyenda
            datos={COLUMNAS.map((c) => ({ ...c, real: -c.real }))}
            moneda={MONEDA}
            alto={150}
          />
        </Estado>
        <Estado nombre="miles de millones">
          <HistoricoConLeyenda
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
          <HistoricoConLeyenda datos={COLUMNAS} moneda={MONEDA} alto={150} />
        </Estado>
        <Estado nombre="período en curso">
          <HistoricoConLeyenda
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
      {/* ── Los tres slots del marco (26.1) ───────────────────────────────────────────── */}
      <Entrada
        id="gr-marco-slots"
        titulo="Marco · acciones, pie y leyenda lateral"
        nota="Los tres slots que la tanda 2 necesita. El corte de la leyenda lateral es del CONTENEDOR: las dos primeras celdas llevan un ancho fijo a propósito, a los dos lados de 420 px."
        spec="`acciones` va en la cabecera, a la derecha, antes de «Ver tabla»: comparte fila con él, así que un bloque alto haría crecer la cabecera y rompería la invariante de los cuatro estados. `pie` va debajo de la tabla y FUERA del lienzo, por la misma razón que la leyenda (decisión 48). `disposicionLeyenda` en «lateral» pone la leyenda a la derecha del lienzo con una consulta de contenedor a 420 px, y con la tabla abierta vuelve a columna para que la tabla no quede encerrada en el ancho del gráfico."
      >
        <Estado nombre="lateral · contenedor 520 px">
          <div style={{ width: 520, maxWidth: "100%" }}>
            <MarcoConSlots lateral />
          </div>
        </Estado>
        <Estado nombre="lateral · contenedor 360 px">
          <div style={{ width: 360, maxWidth: "100%" }}>
            <MarcoConSlots lateral />
          </div>
        </Estado>
        <Estado nombre="inferior (el defecto)">
          <MarcoConSlots />
        </Estado>
        <Estado nombre="sin leyenda, solo acciones y pie">
          <MarcoConSlots sinLeyenda />
        </Estado>
      </Entrada>
      {/* ── La dona en el marco del núcleo (26.3) ─────────────────────────────────────── */}
      <Entrada
        id="gr-dona-marco"
        titulo="Dona · en el marco del núcleo"
        nota="El camino nuevo: el marco pone título, estados y TABLA, y la leyenda va por su slot en disposición lateral. La tarjeta de arriba («Dona») es el camino viejo, que todavía usan cinco pantallas."
        spec="La tabla se construye con `tablaDona` desde LAS MISMAS filas que dibuja el anillo, así que en modo `lista` tiene seis filas más «Otras N» y no veinticinco: lo agrupado en el dibujo está agrupado en la tabla, y lo que se agrupó va en la NOTA de esa fila. El nombre de la figura lo da `describirDona` —título, total y número de partes—, porque el total vivía solo en el centro del anillo, que es un `<div>` encima del SVG. `alto` es el del ANILLO y no el del esqueleto: igualarlos metería aire muerto debajo."
      >
        <Estado nombre="taxonomía · contenedor ancho">
          <div style={{ width: 520, maxWidth: "100%" }}>
            <DonaEnMarco modo="taxonomia" />
          </div>
        </Estado>
        <Estado nombre="taxonomía · contenedor 360 px">
          <div style={{ width: 360, maxWidth: "100%" }}>
            <DonaEnMarco modo="taxonomia" />
          </div>
        </Estado>
        <Estado nombre="lista · con «Otras N»">
          <DonaEnMarco modo="lista" datos={DONA_LARGA} />
        </Estado>
        <Estado nombre="vacío">
          <DonaEnMarco modo="taxonomia" datos={[]} />
        </Estado>
        <Estado nombre="error">
          <DonaEnMarco modo="taxonomia" datos={[]} estado="error" />
        </Estado>
      </Entrada>
    </LienzoCatalogo>
  );
}
