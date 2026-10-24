"use client";

import { useId, useRef, useState } from "react";

import { formatMoney } from "@/lib/format";

import {
  cuantiles,
  etiquetasDeRango,
  gridDelMes,
  nivelDe,
  rangosDeNivel,
  type CeldaCalendario,
} from "./calendario";

/**
 * El gasto de un mes, día a día. SVG propio: ni Recharts ni ECharts.
 *
 * Recharts no tiene calendario, y montar ECharts solo por este gráfico costaba 218 KB gz
 * —medidos— frente a los 89 de Recharts (ver `10-decisions.md`). Lo que hace falta acá es
 * una rejilla de rectángulos con un color por valor: eso es HTML y SVG, no un motor.
 *
 * **Rampa secuencial de un solo tono**, no seis colores. La magnitud tiene orden; seis
 * colores categóricos no lo tienen, y el ojo no sabría si el morado es más o menos que el
 * verde. Un tono con cinco intensidades se lee sin leyenda, aunque la leyenda esté.
 *
 * **Tres estados distintos, no dos.** Un día sin gasto no es «poco gasto»: va en el neutro
 * de superficie. Y un día futuro no es un día sin gasto: va sin relleno y con borde
 * punteado. Colapsarlos haría que el mes en curso pareciera un mes de ahorro ejemplar.
 *
 * **Teclado**: la rejilla es UNA sola parada de Tab —con 30 días, tabular treinta veces para
 * cruzarla es inaceptable— y dentro se navega con flechas (foco itinerante, patrón `grid` de
 * WAI-ARIA). `Enter` fija el día y lo anuncia.
 */
export type DiaGasto = { fecha: string; monto: number; movimientos?: number };

/**
 * Cómo se recorre la rejilla con el teclado. Vive aquí, en una constante exportada, porque
 * lo dicen DOS sitios: el `aria-describedby` de la rejilla (para quien no ve el icono) y el
 * tooltip del «?» (para quien no usa lector). Duplicar la frase es garantizar que un día
 * digan cosas distintas.
 */
export const INSTRUCCIONES_TECLADO =
  "Usá las flechas para moverte por los días, Inicio y Fin para ir al primero o al último, " +
  "y Enter para fijar un día y oírlo en voz alta.";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const NOMBRE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const PASOS = 5;

/** Opacidad de cada nivel sobre el tono base. Cinco pasos perceptualmente separados. */
const OPACIDAD = [0.18, 0.36, 0.55, 0.76, 1];

export function CalendarioGasto({
  anio,
  mes,
  dias,
  moneda = "CRC",
  hoy,
  onFijar,
}: {
  anio: number;
  mes: number;
  dias: readonly DiaGasto[];
  moneda?: string;
  /** `YYYY-MM-DD`. Los días posteriores se pintan como futuros. */
  hoy?: string;
  /** Se llama al fijar un día con Enter o con un clic, y al soltarlo (con `null`). */
  onFijar?: (dia: DiaGasto | null) => void;
}) {
  const idInstrucciones = useId();
  const grid = gridDelMes(anio, mes);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const montos = dias.map((d) => d.monto);
  const cortes = cuantiles(montos, PASOS);
  const rangos = rangosDeNivel(montos, PASOS);
  const etiquetas = etiquetasDeRango(rangos, (n) => formatMoney(n, moneda));

  const celdas = grid.flat().filter((c) => c.fecha !== null);
  const [foco, setFoco] = useState(0);
  const [fijado, setFijado] = useState<string | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const mover = (delta: number) => {
    const siguiente = Math.max(0, Math.min(celdas.length - 1, foco + delta));
    setFoco(siguiente);
    refs.current[siguiente]?.focus();
  };

  const fijar = (fecha: string) => {
    const nuevo = fijado === fecha ? null : fecha;
    setFijado(nuevo);
    onFijar?.(nuevo ? (porFecha.get(nuevo) ?? { fecha: nuevo, monto: 0 }) : null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const saltos: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    if (e.key in saltos) {
      e.preventDefault();
      mover(saltos[e.key]!);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      mover(-foco);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      mover(celdas.length - 1 - foco);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const c = celdas[foco];
      if (c?.fecha) fijar(c.fecha);
    }
  };

  const etiqueta = (c: CeldaCalendario) => {
    const d = c.fecha ? porFecha.get(c.fecha) : undefined;
    const dia = NOMBRE_DIA[c.columna] ?? "";
    if (!d || d.monto <= 0) return `${dia} ${c.dia}, sin gasto`;
    const movs = d.movimientos
      ? `, ${d.movimientos} movimiento${d.movimientos === 1 ? "" : "s"}`
      : "";
    return `${dia} ${c.dia}, ${formatMoney(d.monto, moneda)}${movs}`;
  };

  let indice = -1;

  return (
    <div className="cal">
      <p id={idInstrucciones} className="sr-only">
        {INSTRUCCIONES_TECLADO}
      </p>
      <div className="cal-cabecera" aria-hidden="true">
        {DIAS.map((d, i) => (
          <span key={`${d}-${i}`} className="cal-dow">
            {d}
          </span>
        ))}
      </div>

      <div
        className="cal-grid"
        role="grid"
        aria-label={`Gasto diario, ${mes}/${anio}`}
        // Las instrucciones de teclado ya no están en el subtítulo, que las leía TODO el
        // mundo aunque no fuera a tabular nunca. Acá las oye quien está dentro de la rejilla.
        aria-describedby={idInstrucciones}
        onKeyDown={onKey}
      >
        {grid.map((fila, f) => (
          <div key={f} role="row" className="cal-fila">
            {fila.map((c, i) => {
              if (!c.fecha) {
                return (
                  <div
                    key={`h-${f}-${i}`}
                    role="gridcell"
                    className="cal-hueco"
                    aria-hidden="true"
                  />
                );
              }
              indice++;
              const propio = indice;
              const d = porFecha.get(c.fecha);
              const futuro = hoy !== undefined && c.fecha > hoy;
              const nivel = futuro ? -1 : nivelDe(d?.monto ?? 0, cortes);
              return (
                <div
                  key={c.fecha}
                  role="gridcell"
                  ref={(el) => {
                    refs.current[propio] = el;
                  }}
                  // UNA sola parada de Tab en toda la rejilla: dentro se navega con flechas.
                  tabIndex={propio === foco ? 0 : -1}
                  aria-label={etiqueta(c)}
                  aria-selected={fijado === c.fecha}
                  // El día de hoy se marca en la SEMÁNTICA, no solo con el anillo: sin
                  // `aria-current` un lector de pantalla recorre 30 celdas iguales y no hay
                  // forma de saber en cuál está parado el mes.
                  aria-current={c.fecha === hoy ? "date" : undefined}
                  data-hoy={c.fecha === hoy ? "true" : undefined}
                  data-futuro={futuro ? "true" : undefined}
                  data-vacio={!futuro && nivel < 0 ? "true" : undefined}
                  data-nivel={nivel >= 0 ? nivel : undefined}
                  className="cal-dia"
                  style={
                    nivel >= 0
                      ? {
                          background: `color-mix(in srgb, var(--chart-1) ${Math.round((OPACIDAD[nivel] ?? 1) * 100)}%, var(--surface))`,
                        }
                      : undefined
                  }
                  onClick={() => fijar(c.fecha!)}
                  onFocus={() => setFoco(propio)}
                >
                  <span aria-hidden="true">{c.dia}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {rangos.length > 0 ? (
        <div className="cal-leyenda">
          {/* Los tres estados y los cinco pasos, CON su rango en texto. Un degradado de
              «menos» a «más» no dice cuánto es «más», y el `title` de cada muestra no lo
              dice tampoco: no hay hover en táctil y ningún lector de pantalla lo anuncia. */}
          <span className="cal-leyenda-item">
            <span className="cal-leyenda-paso cal-leyenda-vacio" aria-hidden="true" />
            Sin gasto
          </span>
          {rangos.map((_r, i) => (
            <span key={i} className="cal-leyenda-item">
              <span
                className="cal-leyenda-paso"
                aria-hidden="true"
                style={{
                  background: `color-mix(in srgb, var(--chart-1) ${Math.round((OPACIDAD[i] ?? 1) * 100)}%, var(--surface))`,
                }}
              />
              {etiquetas[i]}
            </span>
          ))}
          <span className="cal-leyenda-item">
            <span className="cal-leyenda-paso cal-leyenda-futuro" aria-hidden="true" />
            Futuro
          </span>
        </div>
      ) : null}
    </div>
  );
}
