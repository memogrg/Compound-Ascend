"use client";

import { useEffect, useReducer, useRef } from "react";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";

import {
  ESTADO_INICIAL,
  ID_OTROS,
  filasDelNivel,
  plegarOtros,
  porcentajesExactos,
  reducirDesglose,
  type FilaDesglose,
} from "./desglose";

/**
 * ¿Dónde exactamente? Barras horizontales ordenadas, con el % del total.
 *
 * **Barras y no dona**, por regla del blueprint: una dona obliga a comparar ángulos, que es
 * lo que peor hace el ojo; una barra ordenada se lee de arriba abajo y el orden ya es la
 * respuesta. (La dona puede acompañar, nunca ser el único desglose.)
 *
 * **Cada fila es UN solo `<button>`** sin nada interactivo adentro. Es deliberado: la tabla
 * de transacciones arrastra 44 nodos de `nested-interactive` por meter botones dentro de una
 * fila que ya era `role="button"`, y esa lección no se repite. El «Ver detalle» del
 * drill-down va FUERA de la fila, como hermano, y solo aparece en la fila seleccionada.
 *
 * **El color sale del dato**, nunca del índice: es la regla que `/m/patrimonio` rompía. Sin
 * color propio, el fallback es `--muted-2` — nunca un color prestado del vecino.
 */
export function BreakdownCard({
  filas,
  total,
  max = 6,
  moneda = "CRC",
  seleccion,
  onSeleccionar,
  cargando = false,
  vacio = "Sin movimientos en este período.",
  etiquetaRaiz = "Todo",
}: {
  filas: readonly FilaDesglose[];
  /** Base del %. Si falta, se usa la suma de las filas del nivel. */
  total?: number;
  max?: number;
  moneda?: string;
  /** Controlado por quien lo usa: así la selección puede filtrar otras tarjetas. */
  seleccion?: string | null;
  onSeleccionar?: (id: string | null) => void;
  cargando?: boolean;
  vacio?: string;
  /** Primer tramo del breadcrumb. */
  etiquetaRaiz?: string;
}) {
  // La RUTA del drill-down es estado propio; la SELECCIÓN la manda quien nos usa.
  const [estado, despachar] = useReducer(reducirDesglose, ESTADO_INICIAL);
  const contenedor = useRef<HTMLDivElement>(null);

  /**
   * Cambiar de nivel limpia la selección EN LOS DOS SITIOS.
   *
   * El reducer ya limpia la suya, pero cuando la selección es controlada la manda el padre,
   * y un id del nivel anterior no existe en el siguiente: ninguna fila lo iguala, así que
   * `activa !== null` y **todas** quedan atenuadas. Se veía como un nivel entero en gris sin
   * nada seleccionado — lo encontró una captura, no un test.
   */
  const cambiarNivel = (accion: { tipo: "entrar"; id: string } | { tipo: "subir" }) => {
    despachar(accion);
    onSeleccionar?.(null);
  };

  const delNivel = filasDelNivel(filas, estado.ruta);
  const visibles = plegarOtros(delNivel, max);
  const base = total ?? visibles.reduce((s, f) => s + f.valor, 0);
  const pcts = porcentajesExactos(
    visibles.map((f) => f.valor),
    estado.ruta.length === 0 ? total : undefined,
  );
  const mayor = visibles.reduce((m, f) => Math.max(m, f.valor), 0);

  const activa = seleccion ?? null;
  const filaActiva = visibles.find((f) => f.id === activa);
  const puedeEntrar = (filaActiva?.hijos?.length ?? 0) > 0;

  // Escape: primero suelta la selección; si no hay, sube un nivel. En ese orden porque es
  // el inverso del que se usó para llegar — deshacer lo último, no lo primero.
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (activa) {
        onSeleccionar?.(null);
      } else if (estado.ruta.length > 0) {
        // Inline y no `cambiarNivel`: esa función se recrea en cada render, así que como
        // dependencia del efecto re-registraría el listener sin parar. `despachar` es
        // estable y `onSeleccionar` ya está en la lista.
        despachar({ tipo: "subir" });
        onSeleccionar?.(null);
      } else {
        return;
      }
      e.stopPropagation();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [activa, estado.ruta.length, onSeleccionar]);

  if (cargando) {
    // Misma altura que con datos: si el esqueleto fuera más bajo, la página saltaría al
    // resolverse, que es justo lo que el esqueleto viene a evitar.
    return (
      <div className="lec-desglose" aria-busy="true">
        {Array.from({ length: Math.min(max, 5) }).map((_, i) => (
          <div key={i} className="lec-fila lec-fila-skel" />
        ))}
      </div>
    );
  }

  if (delNivel.length === 0) {
    return <p className="lec-vacio">{vacio}</p>;
  }

  const tramos = [etiquetaRaiz, ...estado.ruta.map((id) => etiquetaDe(filas, id))];

  return (
    <div className="lec-desglose" ref={contenedor}>
      {estado.ruta.length > 0 ? (
        <nav className="lec-ruta" aria-label="Nivel del desglose">
          <button
            type="button"
            className="lec-subir"
            onClick={() => cambiarNivel({ tipo: "subir" })}
          >
            <Icon name="chev" width={2.2} />
            Volver
          </button>
          <ol>
            {tramos.map((t, i) => (
              <li key={`${t}-${i}`} aria-current={i === tramos.length - 1 ? "true" : undefined}>
                {t}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {/* El nivel se anuncia: quien navega por teclado no ve el breadcrumb aparecer. */}
      <p className="sr-only" aria-live="polite">
        {estado.ruta.length === 0
          ? `Desglose de ${etiquetaRaiz}, ${visibles.length} filas`
          : `Nivel ${tramos.length}: ${tramos[tramos.length - 1]}, ${visibles.length} filas`}
      </p>

      <ul className="lec-filas">
        {visibles.map((f, i) => {
          const pct = pcts[i] ?? 0;
          const esActiva = f.id === activa;
          const atenuada = activa !== null && !esActiva;
          const color = f.color ?? "var(--muted-2)";
          return (
            <li key={f.id} className="lec-fila-li">
              <button
                type="button"
                className="lec-fila"
                aria-pressed={esActiva}
                data-atenuada={atenuada ? "true" : undefined}
                onClick={() => onSeleccionar?.(esActiva ? null : f.id)}
              >
                <span className="lec-swatch" style={{ background: color }} aria-hidden="true" />
                <span className="lec-etiqueta">{f.etiqueta}</span>
                <span className="lec-valor tnum">{formatMoney(f.valor, moneda)}</span>
                <span className="lec-pct tnum">{pct} %</span>
                <span className="lec-barra" aria-hidden="true">
                  <span
                    className="lec-barra-fill"
                    style={{
                      width: mayor > 0 ? `${Math.max(2, (f.valor / mayor) * 100)}%` : "0%",
                      background: color,
                    }}
                  />
                </span>
              </button>

              {/* Hermano del botón, no hijo: un control dentro de otro es `nested-interactive`. */}
              {esActiva && puedeEntrar ? (
                <button
                  type="button"
                  className="lec-detalle"
                  onClick={() => cambiarNivel({ tipo: "entrar", id: f.id })}
                >
                  Ver detalle
                  <Icon name="chev" width={2.2} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="lec-total tnum">
        Total <strong>{formatMoney(base, moneda)}</strong>
      </p>
    </div>
  );
}

/** Etiqueta de una fila por id, buscando en todo el árbol. */
function etiquetaDe(filas: readonly FilaDesglose[], id: string): string {
  for (const f of filas) {
    if (f.id === id) return f.etiqueta;
    if (f.hijos) {
      const hallada = etiquetaDe(f.hijos, id);
      if (hallada !== id) return hallada;
    }
  }
  return id === ID_OTROS ? "Otros" : id;
}
