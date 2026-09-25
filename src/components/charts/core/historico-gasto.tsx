"use client";

/**
 * El «Histórico de gastos» de `/gastos`, migrado al núcleo.
 *
 * Reemplaza a `PerformanceChart` + `goalValue` en esa tarjeta, y de paso arregla tres cosas
 * que venían de ahí:
 *
 * 1. **El presupuesto era una línea horizontal con el total del RANGO.** Con «3m» eran tres
 *    meses de presupuesto dibujados contra el gasto de cada mes suelto, así que la línea
 *    quedaba muy por encima de la serie y parecía holgura donde no la había. Ahora es una
 *    serie mensual EN ESCALÓN: cada mes con el suyo. El escalón, y no una curva, porque un
 *    presupuesto de 1,9 M en agosto y 1,95 M en septiembre no pasó por 1,92 M a mitad de
 *    camino: saltó el día 1.
 * 2. **El degradado del área bajaba por debajo del dato.** El relleno arrancaba en el borde
 *    inferior del gráfico, que con el eje recortado no es el cero: medía la distancia a un
 *    número que no existe. Con `desdeCeroSiCabe` el 0 entra cuando no aplasta la serie, y
 *    solo entonces hay relleno.
 * 3. **El último rótulo del eje X se recortaba.** `padding` en el eje deja los extremos
 *    completos en vez de centrarlos sobre el borde.
 *
 * El último mes va PUNTEADO y con el punto hueco: es un mes a medias, y pintarlo cerrado
 * dice «gastaste esto» cuando lo cierto es «esto llevás».
 */
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatAxisCompact, formatMoney } from "@/lib/format";

import { escalaNice, incluyeCero } from "./escala-nice";
import {
  esTramoParcial,
  partirSerieEnCurso,
  rotuloEnCurso,
  type PeriodoEnCurso,
} from "./periodo-en-curso";
import { EJE, REJILLA, TRAZO } from "./theme";

export type PuntoHistorico = {
  /** Rótulo del mes, ya formateado. */
  label: string;
  /** Gasto real de ese mes. */
  real: number;
  /** Presupuesto de ESE mes (items + aportes). */
  presupuesto: number;
};

/**
 * Punto final hueco: un aro, no un disco. Dice «esto todavía se está llenando».
 *
 * SOLO en el último punto. El trazo en curso comparte su primer punto con la parte cerrada
 * —si no, quedaría un hueco entre las dos líneas—, así que sin este filtro el aro salía
 * también en el mes anterior, que sí está cerrado.
 */
function puntoHueco(ultimo: number) {
  return function PuntoHueco(props: {
    cx?: number;
    cy?: number;
    index?: number;
    key?: React.Key | null;
  }) {
    const { cx, cy } = props;
    if (props.index !== ultimo || typeof cx !== "number" || typeof cy !== "number")
      return <g key={props.key ?? `v-${props.index}`} />;
    return (
      <circle
        key={props.key ?? "fin"}
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--surface)"
        stroke="var(--neg)"
        strokeWidth={2}
      />
    );
  };
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
  const valores = datos.flatMap((d) => [d.real, d.presupuesto]);
  const escala = escalaNice(valores, { moneda, desdeCeroSiCabe: true });
  const conBaseCero = incluyeCero(escala.dominio);

  const { cerrada, enCurso: tramo } = partirSerieEnCurso([...datos], enCurso, "real");
  // Las dos series viven en el MISMO array: Recharts alinea por índice, y dos `data`
  // distintos desalinearían el eje X.
  const filas = datos.map((d, i) => ({
    label: d.label,
    presupuesto: d.presupuesto,
    realCerrado: cerrada[i]?.real ?? null,
    realEnCurso: tramo.length > 0 ? (tramo[i]?.real ?? null) : null,
    parcial: esTramoParcial(i, datos.length, enCurso),
  }));

  const rotulo = rotuloEnCurso(enCurso);

  return (
    <div>
      <ResponsiveContainer width="100%" height={alto}>
        <ComposedChart data={filas} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
          <CartesianGrid stroke={REJILLA.color} strokeDasharray="2 5" vertical={false} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            // Sin este aire, el primer y el último rótulo se centran sobre el borde del
            // gráfico y se recortan: el último mes salía a medias.
            padding={{ left: 10, right: 14 }}
            stroke={EJE.color}
            tick={{ fontSize: EJE.tamanoFuente, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            dy={4}
          />
          <YAxis
            domain={escala.dominio}
            ticks={escala.ticks}
            width={52}
            stroke={EJE.color}
            tick={{ fontSize: EJE.tamanoFuente, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatAxisCompact(v, moneda)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0]?.payload as (typeof filas)[number] | undefined;
              if (!fila) return null;
              const real = fila.realCerrado ?? fila.realEnCurso;
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
                        Gasto <b>{real === null ? "—" : formatMoney(real, moneda)}</b>
                      </span>
                    </li>
                    <li className="cf-tip-fila">
                      <span className="cf-tip-trazo" style={{ background: "var(--muted-2)" }} />
                      <span className="cf-tip-cuerpo">
                        Presupuesto <b>{formatMoney(fila.presupuesto, moneda)}</b>
                      </span>
                    </li>
                  </ul>
                </div>
              );
            }}
          />
          {/* El presupuesto, EN ESCALÓN: rige desde el día 1 y salta, no sube en rampa. */}
          <Line
            type="stepAfter"
            dataKey="presupuesto"
            stroke="var(--muted-2)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          {/* El gasto real, en dos trazos: lo cerrado y el mes a medias. */}
          <Line
            type="monotone"
            dataKey="realCerrado"
            stroke="var(--neg)"
            strokeWidth={TRAZO.ancho}
            dot={false}
            connectNulls={false}
            fill={conBaseCero ? "var(--neg)" : undefined}
            isAnimationActive={false}
          />
          {tramo.length > 0 ? (
            <Line
              type="monotone"
              dataKey="realEnCurso"
              stroke="var(--neg)"
              strokeWidth={TRAZO.ancho}
              strokeDasharray="5 4"
              connectNulls={false}
              dot={puntoHueco(datos.length - 1)}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      {rotulo ? (
        <p className="cf-en-curso" aria-live="polite">
          {rotulo}
        </p>
      ) : null}
    </div>
  );
}
