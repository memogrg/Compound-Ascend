"use client";

import { useId, useState } from "react";

import { ChartEmpty } from "../chart-empty";
import type { TablaDatos } from "./accesible";
import { ALTO_MINIMO } from "./theme";

export type EstadoGrafico = "datos" | "cargando" | "vacio" | "error";

/**
 * El marco de todo gráfico del núcleo: título, estados y —lo importante— la TABLA.
 *
 * El canal accesible es una tabla real, con `<caption>` y encabezados, que además
 * **cualquiera** puede abrir con el botón «Ver tabla»: quien no distingue los colores, quien
 * quiere copiar un número, o quien simplemente no lee bien un gráfico. La accesibilidad como
 * función, no como rampa lateral.
 *
 * El SVG NO va `aria-hidden`, y esto merece una explicación porque la intención original era
 * la contraria. Ocultarlo choca de frente con `accessibilityLayer` de Recharts, que es lo que
 * permite recorrer el gráfico con las flechas: pone `tabIndex=0` en su envoltorio, y un
 * elemento focalizable dentro de un `aria-hidden` es la violación `aria-hidden-focus`
 * —serious— que axe reportó en la primera corrida de este marco. Se puede tener una cosa o la
 * otra, no las dos. Gana el teclado: un gráfico navegable sirve a más gente que uno escondido,
 * y la tabla sigue estando para quien prefiera los números.
 *
 * Los cuatro estados ocupan LA MISMA altura. Si el estado de carga midiera distinto que el de
 * datos, la página daría un salto al resolverse, que es el defecto que el `skeleton` venía a
 * evitar.
 */
export function ChartFrame({
  titulo,
  subtitulo,
  descripcion,
  alto = 220,
  estado = "datos",
  mensajeVacio = "No hay suficiente historial para mostrar la gráfica.",
  mensajeError = "No se pudo cargar la gráfica.",
  tabla,
  leyenda,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** `aria-label` del gráfico, de `describirGrafico()`. Es el titular hablado. */
  descripcion: string;
  alto?: number;
  estado?: EstadoGrafico;
  mensajeVacio?: string;
  mensajeError?: string;
  tabla: TablaDatos;
  leyenda?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const idTabla = `cf-tabla-${useId()}`;
  const altura = Math.max(alto, ALTO_MINIMO);

  return (
    <figure className="cf">
      <figcaption className="cf-cab">
        <div className="cf-titulos">
          <h3 className="cf-titulo">{titulo}</h3>
          {subtitulo ? <p className="cf-sub">{subtitulo}</p> : null}
        </div>
        {estado === "datos" ? (
          <button
            type="button"
            className="cf-btn-tabla"
            aria-expanded={verTabla}
            aria-controls={idTabla}
            onClick={() => setVerTabla((v) => !v)}
          >
            {verTabla ? "Ver gráfico" : "Ver tabla"}
          </button>
        ) : null}
      </figcaption>

      {leyenda}

      <div className="cf-lienzo" style={{ height: altura }}>
        {estado === "cargando" ? (
          <div className="skel" style={{ height: "100%", width: "100%" }} aria-hidden="true" />
        ) : estado === "vacio" ? (
          <ChartEmpty message={mensajeVacio} height={altura} />
        ) : estado === "error" ? (
          <ChartEmpty message={mensajeError} height={altura} />
        ) : (
          <div style={{ height: "100%", display: verTabla ? "none" : "block" }}>{children}</div>
        )}

        {/* La tabla está SIEMPRE en el DOM: oculta a la vista con `.sr-only` cuando el botón
            no la ha abierto, nunca `display:none`, porque eso también la esconde del lector.
            El `aria-label` del gráfico vive acá, en el elemento que sí tiene contenido. */}
        {estado === "datos" ? (
          <div
            id={idTabla}
            className={verTabla ? "cf-tabla-vista" : "sr-only"}
            role="group"
            aria-label={descripcion}
          >
            <table className="cf-tabla">
              <caption>{descripcion}</caption>
              <thead>
                <tr>
                  {tabla.encabezados.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.map((fila) => (
                  <tr key={fila[0]}>
                    {fila.map((celda, i) =>
                      i === 0 ? (
                        <th key={i} scope="row">
                          {celda}
                        </th>
                      ) : (
                        <td key={i}>{celda}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
