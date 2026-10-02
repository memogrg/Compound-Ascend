"use client";

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { HelpTip } from "@/components/shared/help-tip";

import { ChartEmpty } from "../chart-empty";
import { filaNormalizada, textoCelda, tonoCelda, type TablaDatos } from "./accesible";
import { NOMBRE_RANGO, type RangoPreset } from "./rangos";
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
  reservaSuperior = 0,
  estado = "datos",
  mensajeVacio = "No hay suficiente historial para mostrar la gráfica.",
  mensajeError = "No se pudo cargar la gráfica.",
  ayuda,
  tabla,
  leyenda,
  rangos,
  rangoActivo,
  onRango,
  anuncio,
  onSoltar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** `aria-label` del gráfico, de `describirGrafico()`. Es el titular hablado. */
  descripcion: string;
  alto?: number;
  /**
   * Alto EXTRA sobre el del gráfico, para la franja del tooltip anclado en táctil.
   *
   * Suma, no resta. La primera versión lo descontaba del área de trazado con `margin.top` y
   * dejaba una curva de 40 px en un gráfico de 230: el tooltip dejaba de tapar el trazado
   * porque casi no quedaba trazado. La reserva tiene que darle sitio al tooltip sin quitárselo
   * al dato.
   */
  reservaSuperior?: number;
  estado?: EstadoGrafico;
  mensajeVacio?: string;
  mensajeError?: string;
  /**
   * Ayuda del gráfico, en un «?» junto al título. Va acá y no en el subtítulo porque el
   * subtítulo lo lee todo el mundo: unas instrucciones de teclado ahí son ruido para quien
   * usa el ratón, y quien SÍ teclea las encuentra igual por `aria-describedby`.
   */
  ayuda?: ReactNode;
  tabla: TablaDatos;
  leyenda?: React.ReactNode;
  /**
   * Presets de zoom («6M», «1A», «Todo») como chips sobre el gráfico.
   *
   * Chips y no solo un `<Brush>`: el brush se arrastra con el ratón y no tiene equivalente
   * de teclado documentado, así que como ÚNICO camino dejaría el zoom fuera del alcance de
   * quien no usa ratón. El brush puede acompañar para el ajuste fino; los chips son el
   * camino principal. La tabla refleja el rango activo, no la serie entera.
   */
  rangos?: readonly RangoPreset[];
  rangoActivo?: RangoPreset;
  onRango?: (r: RangoPreset) => void;
  /**
   * Lo que se anuncia por `aria-live` (de `describirPunto`). Se pasa solo en navegación por
   * TECLADO: anunciarlo en cada hover de ratón convierte el lector en ruido continuo.
   */
  anuncio?: string | null;
  /** Soltar el punto fijado: Escape, o un clic fuera del marco. */
  onSoltar?: () => void;
  children: React.ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const idTabla = `cf-tabla-${useId()}`;
  const altura = Math.max(alto, ALTO_MINIMO) + reservaSuperior;
  const figuraRef = useRef<HTMLElement>(null);

  /**
   * El anuncio va con retardo. Sin él, recorrer diez puntos con la flecha encola diez
   * mensajes y el lector los lee todos con el gráfico ya parado; con 150 ms solo se anuncia
   * donde la persona se detuvo, que es lo que quería oír.
   */
  const [anuncioTardio, setAnuncioTardio] = useState("");
  useEffect(() => {
    if (!anuncio) {
      setAnuncioTardio("");
      return;
    }
    const t = setTimeout(() => setAnuncioTardio(anuncio), 150);
    return () => clearTimeout(t);
  }, [anuncio]);

  /** Un clic fuera del marco suelta el punto fijado: es lo que uno espera de algo «clavado». */
  useEffect(() => {
    if (!onSoltar) return;
    function alPulsar(e: PointerEvent) {
      const f = figuraRef.current;
      if (f && e.target instanceof Node && !f.contains(e.target)) onSoltar!();
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") onSoltar!();
    }
    document.addEventListener("pointerdown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("pointerdown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [onSoltar]);

  return (
    /* `data-estado` no pinta nada: existe para poder AFIRMAR sobre el estado desde fuera.
       La tabla solo se monta con datos —un marco vacío o en error no tiene nada que tabular—,
       así que la invariante «todo marco tiene su tabla» solo se puede comprobar si se puede
       distinguir un marco con datos de uno sin ellos. Antes se comprobaba sobre la página
       entera, y el catálogo de estados la rompió con 36 marcos y 24 tablas. */
    <figure className="cf" data-estado={estado} ref={figuraRef}>
      <figcaption className="cf-cab">
        <div className="cf-titulos">
          <h3 className="cf-titulo">
            {titulo}
            {ayuda ? <HelpTip text={ayuda} label="Cómo se usa este gráfico" /> : null}
          </h3>
          {subtitulo ? <p className="cf-sub">{subtitulo}</p> : null}
        </div>
        {/*
         * El botón se PINTA SIEMPRE y solo se esconde cuando no hay datos.
         *
         * Quitarlo cambiaba el alto del encabezado, y con él el de todo el marco: 220 px con
         * datos contra 213 px vacío. O sea que este componente incumplía, por 7 px, la
         * invariante que su propia cabecera promete —«los cuatro estados ocupan LA MISMA
         * altura»— y nadie lo veía porque en producción ningún llamador pasa `estado`.
         *
         * `visibility: hidden` y no `display: none`: conserva la caja Y saca el botón del orden
         * de tabulación, que es justo lo que hace falta — un «Ver tabla» alcanzable con el
         * teclado cuando no hay tabla sería una promesa vacía.
         */}
        <button
          type="button"
          className="cf-btn-tabla"
          data-reservado={estado === "datos" ? undefined : ""}
          aria-hidden={estado === "datos" ? undefined : true}
          aria-expanded={verTabla}
          aria-controls={idTabla}
          onClick={() => setVerTabla((v) => !v)}
        >
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      </figcaption>

      {/* `radiogroup` y no una lista de botones: los presets son una elección entre
          opciones excluyentes, y así el lector anuncia «2 de 3» y las flechas recorren el
          grupo. Un botón suelto por rango no diría que solo uno puede estar activo. */}
      {rangos && rangos.length > 0 && estado === "datos" ? (
        <div
          className="cf-rangos"
          role="radiogroup"
          aria-label="Rango del gráfico"
          onKeyDown={(e) => {
            // Un `radiogroup` promete flechas: es UNA parada de Tab y dentro se recorre con
            // ← →. Sin esto, Tab pararía en cada chip y el rol estaría mintiendo.
            const paso =
              e.key === "ArrowRight" || e.key === "ArrowDown"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? -1
                  : 0;
            if (paso === 0) return;
            e.preventDefault();
            const i = rangos.indexOf(rangoActivo ?? rangos[0]!);
            const siguiente = rangos[(i + paso + rangos.length) % rangos.length]!;
            onRango?.(siguiente);
          }}
        >
          {rangos.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={r === rangoActivo}
              aria-label={NOMBRE_RANGO[r]}
              // Solo el activo entra en el orden de tabulación, como manda el patrón.
              tabIndex={r === rangoActivo ? 0 : -1}
              className="cf-rango"
              onClick={() => onRango?.(r)}
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}

      {leyenda}

      {/* `aria-live` fuera del lienzo y siempre en el DOM: un live region que se monta y
          desmonta no se anuncia, porque el lector solo observa lo que ya estaba. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncioTardio}
      </div>

      {/* `touch-action: pan-y`: el arrastre HORIZONTAL recorre puntos y el VERTICAL sigue
          desplazando la página. Con `none` —lo que usa `m-scrub-chart` en `/m`, donde el
          gráfico ocupa el ancho entero— un gráfico embebido en una página larga se comería el
          scroll y dejaría a la persona atrapada. */}
      <div className="cf-lienzo" style={{ height: altura, touchAction: "pan-y" }}>
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
              {/* El `titulo` de la tabla gana sobre la descripción del gráfico cuando existe: «Gasto y
                    presupuesto por mes» dice qué se está tabulando, mientras que la descripción
                    narra la forma de la serie —que es lo que hace falta oír del GRÁFICO, no de
                    la tabla—. */}
              <caption>{tabla.titulo ?? descripcion}</caption>
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
                {/* Una fila puede venir en la forma simple (`string[]`) o en la rica, con tono por
                    celda y una nota a todo el ancho. Se normaliza acá para que el marco pinte UNA
                    sola cosa, y para que un gráfico con tabla más rica no tenga que pintarse la
                    suya — que fue como acabamos con dos tablas de los mismos datos en una tarjeta. */}
                {tabla.filas.map((cruda) => {
                  const fila = filaNormalizada(cruda);
                  const clave = textoCelda(fila.celdas[0] ?? "");
                  return (
                    <Fragment key={clave}>
                      <tr>
                        {fila.celdas.map((celda, i) =>
                          i === 0 ? (
                            <th key={i} scope="row">
                              {textoCelda(celda)}
                            </th>
                          ) : (
                            <td key={i} data-tono={tonoCelda(celda)}>
                              {textoCelda(celda)}
                            </td>
                          ),
                        )}
                      </tr>
                      {fila.nota ? (
                        <tr className="cf-tabla-nota">
                          <td
                            className="cf-tabla-avance"
                            colSpan={tabla.encabezados.length}
                            data-tono={fila.nota.tono}
                          >
                            {fila.nota.texto}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
