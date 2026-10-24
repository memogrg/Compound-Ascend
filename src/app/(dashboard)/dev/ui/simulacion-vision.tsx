"use client";

import { useId, useState } from "react";

import { DICROMACIAS, valoresFeColorMatrix, type Dicromacia } from "@/lib/qa/dicromacia";

/**
 * Simulación de dicromacia y `forced-colors` sobre el catálogo (delta 2.6c).
 *
 * Los filtros se construyen con las MISMAS constantes que el validador de paleta: ver
 * `src/lib/qa/dicromacia.ts`, y el caso que compara las dos cuentas color a color.
 *
 * **Sin `color-interpolation-filters`**, a propósito: el valor inicial de SVG es `linearRGB`, que
 * es el espacio en el que el validador hace la cuenta. Escribir `sRGB` ahí —o «arreglarlo» para
 * que se parezca más a lo que uno espera— haría que la pantalla dejara de coincidir con el
 * validador sin que ninguno de los dos cambiara un número.
 */

const NOMBRES: Record<Dicromacia, string> = {
  protanopia: "Protanopía",
  deuteranopia: "Deuteranopía",
  tritanopia: "Tritanopía",
};

export function FiltrosDicromacia() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {DICROMACIAS.map((t) => (
          <filter key={t} id={`sim-${t}`}>
            <feColorMatrix type="matrix" values={valoresFeColorMatrix(t)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export function ControlesVision({
  vision,
  setVision,
  forzados,
  setForzados,
}: {
  vision: Dicromacia | "normal";
  setVision: (v: Dicromacia | "normal") => void;
  forzados: boolean;
  setForzados: (f: boolean) => void;
}) {
  // El `name` tiene que ser ÚNICO por instancia. El catálogo monta estos controles dos veces
  // —estados y gráficos— y con el name compartido el navegador los trata como UN solo grupo de
  // radios: marcar uno desmarca el del otro bloque, React vuelve a imponer su estado, y el clic
  // «no cambia el estado». Playwright lo dijo con esas palabras exactas.
  const grupo = useId();
  return (
    <div className="du-controles" role="group" aria-label="Simulación de visión">
      <fieldset>
        <legend>Visión</legend>
        {(["normal", ...DICROMACIAS] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name={`du-vision-${grupo}`}
              checked={vision === v}
              onChange={() => setVision(v)}
            />
            {v === "normal" ? "normal" : NOMBRES[v]}
          </label>
        ))}
      </fieldset>
      <label className="du-check">
        <input type="checkbox" checked={forzados} onChange={(e) => setForzados(e.target.checked)} />
        Colores forzados
      </label>
    </div>
  );
}

/** Estado compartido por las dos secciones del catálogo. */
export function useSimulacionVision() {
  const [vision, setVision] = useState<Dicromacia | "normal">("normal");
  const [forzados, setForzados] = useState(false);
  return {
    vision,
    setVision,
    forzados,
    setForzados,
    /** Lo que hay que poner en el lienzo. */
    props: {
      "data-vision": vision === "normal" ? undefined : vision,
      "data-forzados": forzados ? "1" : undefined,
      style: vision === "normal" ? undefined : { filter: `url(#sim-${vision})` },
    } as const,
  };
}
