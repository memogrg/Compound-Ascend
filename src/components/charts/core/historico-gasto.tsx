"use client";

/**
 * El «Histórico de gastos» de `/gastos`: una COLUMNA por mes y una marca de presupuesto.
 *
 * Antes eran dos líneas. Una línea une puntos, y unir el gasto de julio con el de agosto
 * dibuja una pendiente que no existe: nadie gastó a ritmo constante entre el 31 y el 1. Un
 * mes es un total cerrado, y un total se lee como columna. La comparación con el presupuesto
 * pasa a ser lo que de verdad es —¿llegó la columna a la marca?— en vez de dos trazos que se
 * cruzan.
 *
 * Tres decisiones que no son de gusto:
 *
 * 1. **El eje arranca en 0, siempre.** En un gráfico de barras el área de la barra ES el
 *    dato; recortar el eje multiplica visualmente las diferencias. En el de líneas se podía
 *    recortar (`desdeCeroSiCabe`) porque ahí el dato es la altura del punto, no un área.
 * 2. **La marca de presupuesto va CENTRADA en su valor** (`y - grosor/2`), no apoyada
 *    encima ni debajo. Con 2 px de grosor la diferencia es medio píxel, pero es la
 *    diferencia entre marcar el presupuesto y marcar «el presupuesto más un pelo».
 * 3. **La marca sobresale de la columna** y se recorta a su banda (`anchoMarca`): tiene que
 *    leerse como referencia externa, y no puede invadir la del mes vecino — si lo hace, el
 *    ojo une las marcas y vuelve a ver la línea horizontal única que el escalón mensual de
 *    #851 vino a eliminar.
 *
 * El mes en curso va lavado y con contorno punteado, y lo dice con palabras: «parcial · día
 * N de M», con N y M **del servidor** (`userToday`, en la zona del perfil). Este módulo no
 * consulta ningún reloj; si lo hiciera, la captura de QA con el reloj congelado mostraría el
 * día real y no el congelado.
 */
import { Fragment } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatAxisCompact, formatMoney } from "@/lib/format";

import { escalaNice } from "./escala-nice";
import {
  anchoMarca,
  diferencia,
  filasHistorico,
  mensajeEnCurso,
  partesColumna,
  porcentajeEjecucion,
  GROSOR_MARCA,
  type FilaHistorico,
  type PuntoHistorico,
} from "./historico-columnas";
import { rotuloParcial, type PeriodoEnCurso } from "./periodo-en-curso";
import { anchoDeBarra, useAncho } from "./use-ancho";
import { BARRA, EJE, OPACIDAD, REJILLA } from "./theme";

export type { PuntoHistorico };

/** Ancho reservado al eje Y, y el aire a la derecha. Se restan para medir el trazado. */
const ANCHO_EJE = 52;
const AIRE_DERECHA = 10;

/**
 * El tono CLARO de la rampa de gasto: 75 % de `--neg` sobre la superficie.
 *
 * El 75 no es estético, es el único paso que cumple las dos condiciones a la vez. Medido
 * sobre los tokens reales:
 *
 *                      vs superficie      vs `--neg` pleno
 *   claro   75 %          3,07:1              1,51:1
 *   oscuro  75 %          3,32:1              1,48:1
 *
 * Por debajo de 75 la columna deja de llegar al 3:1 que pide WCAG 1.4.11 contra el fondo
 * (a 55 % son 2,22:1); por encima, los dos tramos se parecen cada vez más entre sí. Como
 * 1,5:1 NO alcanza para separar dos tramos que significan cosas distintas, el borde entre
 * ellos lo lleva un separador del color de la superficie —el mismo truco que el hueco de la
 * dona— y la leyenda nombra los dos.
 */
const TONO_DENTRO = "color-mix(in srgb, var(--neg) 75%, var(--surface))";

/** Separador entre los dos tramos. En píxeles, para que no dependa de la altura. */
const SEPARADOR = 1.5;

/**
 * La columna del mes, en dos tramos apilados: lo que cupo en el presupuesto y lo que se pasó.
 *
 * El apilado no es decoración. Con una columna de un solo color, saber cuánto se pasó exige
 * comparar dos alturas contra una marca, que es una medida que el ojo hace mal. Partida, el
 * exceso ES un rectángulo con su propia altura: se ve cuánto sin medir nada.
 *
 * Se dibuja con una forma propia y no con dos barras apiladas de Recharts porque así el
 * redondeo del extremo cae siempre en el tramo de ARRIBA, sea cual sea —con dos barras, la
 * de abajo se redondearía por dentro y dejaría una muesca cuando hay exceso.
 *
 * El eje arranca en 0, así que la altura es proporcional al monto y el reparto es exacto.
 */
function ColumnaGasto(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FilaHistorico;
}) {
  const { x, y, width, height, payload } = props;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !payload
  ) {
    return <g />;
  }
  const { exceso } = partesColumna(payload.real, payload.presupuesto);
  if (!(payload.real > 0) || !(height > 0)) return <g className="cf-col" />;

  const r = BARRA.radio;
  const hExceso = (height * exceso) / payload.real;
  const opacidad = payload.parcial ? OPACIDAD.atenuada : OPACIDAD.normal;
  const arriba: [number, number, number, number] = [r, r, 0, 0];

  return (
    <g className={payload.parcial ? "cf-col cf-col-parcial-g" : "cf-col"}>
      {exceso > 0 ? (
        <>
          <Rectangle
            className="cf-col-exceso"
            x={x}
            y={y}
            width={width}
            height={hExceso}
            radius={arriba}
            fill="var(--neg)"
            fillOpacity={opacidad}
          />
          <Rectangle
            className="cf-col-dentro"
            x={x}
            y={y + hExceso + SEPARADOR}
            width={width}
            height={Math.max(0, height - hExceso - SEPARADOR)}
            fill={TONO_DENTRO}
            fillOpacity={opacidad}
          />
        </>
      ) : (
        <Rectangle
          className="cf-col-dentro"
          x={x}
          y={y}
          width={width}
          height={height}
          radius={arriba}
          fill={TONO_DENTRO}
          fillOpacity={opacidad}
        />
      )}
      {/* El mes a medias, además del relleno lavado, va con contorno punteado: el color no
          puede ser el único canal (WCAG 1.4.1). El contorno rodea la columna ENTERA, no cada
          tramo, porque lo parcial es del mes y no de una de sus partes. */}
      {payload.parcial ? (
        <Rectangle
          className="cf-col-parcial"
          x={x}
          y={y}
          width={width}
          height={height}
          radius={arriba}
          fill="none"
          stroke="var(--neg)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ) : null}
    </g>
  );
}

/**
 * La marca de presupuesto: un rectángulo de 2 px, y nada más.
 *
 * Es una barra de Recharts con forma propia en vez de una `ReferenceLine`, porque hay una
 * marca POR MES: la línea de referencia es horizontal y cruzaría el gráfico entero. Al ser
 * una barra, la posición vertical la calcula la misma escala que coloca las columnas — no
 * hay dos matemáticas que puedan divergir.
 */
function MarcaPresupuesto(props: { x?: number; y?: number; width?: number }) {
  const { x, y, width } = props;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number") return <g />;
  return (
    <rect
      className="cf-marca"
      x={x}
      y={y - GROSOR_MARCA / 2}
      width={width}
      height={GROSOR_MARCA}
      fill="var(--muted)"
    />
  );
}

/** «−₡200.000 bajo presupuesto» / «+₡120.000 sobre presupuesto». */
function textoDiferencia(real: number, presupuesto: number, moneda: string): string {
  const d = diferencia(real, presupuesto);
  if (d === 0) return "justo en el presupuesto";
  const signo = d > 0 ? "+" : "−";
  return `${signo}${formatMoney(Math.abs(d), moneda)} ${d > 0 ? "sobre" : "bajo"} presupuesto`;
}

/** «58 %», o «—» cuando no hay presupuesto contra el que medir. */
function textoEjecucion(real: number, presupuesto: number): string {
  const pct = porcentajeEjecucion(real, presupuesto);
  return pct === null ? "—" : `${pct} %`;
}

export function HistoricoGasto({
  datos,
  moneda,
  enCurso,
  alto = 200,
}: {
  datos: readonly PuntoHistorico[];
  moneda: string;
  enCurso?: PeriodoEnCurso | null;
  alto?: number;
}) {
  // El ancho MEDIDO del contenedor, para pedir el `barSize` exacto en vez de recortarlo con
  // `maxBarSize` — que recorta después de colocar y deja el sobrante como hueco (#850).
  const [ref, ancho] = useAncho<HTMLDivElement>();

  const filas = filasHistorico(datos, enCurso);
  // El eje llega hasta el mayor de los dos: si el presupuesto queda fuera del dominio, su
  // marca se dibujaría pegada al borde superior y parecería alcanzada.
  const escala = escalaNice(
    datos.flatMap((d) => [d.real, d.presupuesto]),
    { moneda, desdeCero: true },
  );

  const anchoTrazado = Math.max(0, ancho - ANCHO_EJE - AIRE_DERECHA);
  const banda = filas.length > 0 ? anchoTrazado / filas.length : 0;
  const anchoColumna = anchoDeBarra(anchoTrazado, filas.length, 1);
  const anchoDeMarca = anchoMarca(anchoColumna, banda);
  const rotulo = rotuloParcial(enCurso);
  const hayParcial = filas.some((f) => f.parcial);
  const hayExceso = filas.some((f) => partesColumna(f.real, f.presupuesto).exceso > 0);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={alto}>
        <ComposedChart data={filas} margin={{ top: 8, right: AIRE_DERECHA, left: 0, bottom: 2 }}>
          <CartesianGrid stroke={REJILLA.color} strokeDasharray="2 5" vertical={false} />
          {/* Sin `padding`: en un gráfico de barras los rótulos van centrados en su banda y
              no sobre el borde, así que no hay nada que recortar — y el aire desalinearía
              este eje del de la marca, que no lo lleva. */}
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            stroke={EJE.color}
            tick={{ fontSize: EJE.tamanoFuente, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            dy={4}
          />
          {/* El segundo eje X, oculto, es lo que permite SUPERPONER la marca a la columna en
              vez de ponerla al lado: dos barras del mismo eje se reparten la banda, dos
              barras de ejes distintos se centran cada una en la suya, que es la misma. */}
          <XAxis dataKey="label" xAxisId="marca" hide />
          <YAxis
            domain={escala.dominio}
            ticks={escala.ticks}
            width={ANCHO_EJE}
            stroke={EJE.color}
            tick={{ fontSize: EJE.tamanoFuente, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatAxisCompact(v, moneda)}
          />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0]?.payload as (typeof filas)[number] | undefined;
              if (!fila) return null;
              const avance = fila.parcial
                ? mensajeEnCurso(fila.real, fila.presupuesto, enCurso, moneda)
                : null;
              return (
                <div className="cf-tip">
                  <div className="cf-tip-x">
                    {String(label)}
                    {fila.parcial ? <span className="cf-parcial"> · parcial</span> : null}
                  </div>
                  <ul className="cf-tip-lista">
                    <li className="cf-tip-fila">
                      <span className="cf-tip-trazo" style={{ background: "var(--neg)" }} />
                      <span className="cf-tip-cuerpo">
                        Gasto <b>{formatMoney(fila.real, moneda)}</b>
                      </span>
                    </li>
                    <li className="cf-tip-fila">
                      <span className="cf-tip-trazo" style={{ background: "var(--muted)" }} />
                      <span className="cf-tip-cuerpo">
                        Presupuesto <b>{formatMoney(fila.presupuesto, moneda)}</b>
                      </span>
                    </li>
                  </ul>
                  {/* El mes a medias NO lleva diferencia con signo, y menos en verde: a
                      mitad de mes «−₡559.067» se lee como «vas ahorrando» cuando lo cierto
                      es «todavía no gastaste lo que te toca». Lo accionable es cuánto queda
                      y para cuántos días. */}
                  {avance ? (
                    <p className="cf-tip-nota" data-tono={avance.tono}>
                      {avance.texto} · {textoEjecucion(fila.real, fila.presupuesto)} ejecutado
                    </p>
                  ) : (
                    <p className="cf-tip-nota">
                      {textoDiferencia(fila.real, fila.presupuesto, moneda)} ·{" "}
                      {textoEjecucion(fila.real, fila.presupuesto)} ejecutado
                    </p>
                  )}
                </div>
              );
            }}
          />
          {/* Las columnas del gasto, apiladas: lo que cupo en el presupuesto y el exceso. */}
          <Bar
            dataKey="real"
            barSize={anchoColumna > 0 ? anchoColumna : undefined}
            shape={<ColumnaGasto />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="presupuesto"
            xAxisId="marca"
            barSize={anchoDeMarca > 0 ? anchoDeMarca : undefined}
            shape={<MarcaPresupuesto />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* La leyenda es DOM y no la de Recharts: hay tres cosas que nombrar y una de ellas
          —«Parcial»— no es una serie sino un estado de la última columna. Reutiliza
          `.cf-leyenda` y `.cf-swatch` del núcleo: el swatch imita la marca, bloque para la
          columna y línea para el presupuesto. */}
      <ul className="cf-leyenda cf-leyenda-fija">
        <li className="cf-leyenda-item">
          <span
            className="cf-swatch cf-swatch-bloque"
            style={{ background: TONO_DENTRO }}
            aria-hidden="true"
          />
          Gasto del mes
        </li>
        {/* Solo si algún mes se pasó. Nombrar un tramo que no está dibujado manda a buscar
            en el gráfico una cosa que no existe. */}
        {hayExceso ? (
          <li className="cf-leyenda-item">
            <span
              className="cf-swatch cf-swatch-bloque"
              style={{ background: "var(--neg)" }}
              aria-hidden="true"
            />
            Exceso sobre el presupuesto
          </li>
        ) : null}
        <li className="cf-leyenda-item">
          <span
            className="cf-swatch cf-swatch-linea"
            style={{ background: "var(--muted)" }}
            aria-hidden="true"
          />
          Presupuesto del mes
        </li>
        {/* Solo si hay un mes a medias: una entrada de leyenda para algo que no está
            dibujado manda a buscar en el gráfico una cosa que no existe. */}
        {hayParcial ? (
          <li className="cf-leyenda-item">
            <span className="cf-swatch cf-swatch-bloque cf-swatch-parcial" aria-hidden="true" />
            Parcial
          </li>
        ) : null}
      </ul>

      {rotulo ? (
        <p className="cf-en-curso" aria-live="polite">
          {rotulo}
        </p>
      ) : null}

      {/* La tabla es la alternativa no visual del gráfico, y de paso el único sitio donde la
          diferencia y el % de ejecución se ven de los doce meses A LA VEZ: el tooltip los da
          de uno en uno. Cerrada por defecto para no duplicar el alto de la tarjeta. */}
      <details className="cf-datos">
        <summary className="cf-datos-abrir">Ver los datos</summary>
        <div className="cf-datos-caja">
          <table className="cf-tabla">
            <caption>Gasto y presupuesto por mes</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Gasto</th>
                <th scope="col">Presupuesto</th>
                <th scope="col">Diferencia</th>
                <th scope="col">Ejecución</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const d = diferencia(f.real, f.presupuesto);
                const avance = f.parcial
                  ? mensajeEnCurso(f.real, f.presupuesto, enCurso, moneda)
                  : null;
                return (
                  <Fragment key={f.label}>
                    <tr>
                      <th scope="row">
                        {f.label}
                        {f.parcial ? <span className="cf-parcial"> · parcial</span> : null}
                      </th>
                      <td>{formatMoney(f.real, moneda)}</td>
                      <td>{formatMoney(f.presupuesto, moneda)}</td>
                      {/* Mismo criterio que el tooltip: el mes abierto no lleva diferencia
                          con signo. Un guion, que es «no aplica», y no un número. */}
                      <td data-tono={avance || d === 0 ? undefined : d > 0 ? "malo" : "bueno"}>
                        {avance || d === 0
                          ? "—"
                          : `${d > 0 ? "+" : "−"}${formatMoney(Math.abs(d), moneda)}`}
                      </td>
                      <td>{textoEjecucion(f.real, f.presupuesto)}</td>
                    </tr>
                    {/* El mensaje del mes abierto va en su propia fila, a todo el ancho. En
                        la celda de Diferencia —que mide unos 15 caracteres— se partía en
                        cuatro renglones y duplicaba el alto de la tabla. */}
                    {avance ? (
                      <tr className="cf-tabla-nota">
                        <td className="cf-tabla-avance" colSpan={5} data-tono={avance.tono}>
                          {avance.texto}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
