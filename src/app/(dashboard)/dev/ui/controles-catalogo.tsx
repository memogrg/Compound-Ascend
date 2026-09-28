"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";

import { DICROMACIAS, type Dicromacia } from "@/lib/qa/dicromacia";

import { FiltrosDicromacia } from "./simulacion-vision";

/**
 * UN solo panel de controles para todo el catálogo (delta 2.6c).
 *
 * Antes había dos: uno en «Estados» y otro en «Estados de los gráficos», con el mismo
 * contenido, el mismo CSS y dos estados independientes. Mirar la misma primitiva en
 * oscuro y el gráfico de al lado en claro no compara nada, y el que mira tiene que
 * acordarse de mover los dos. Ahora el estado vive acá y las dos secciones lo consumen.
 *
 * El otro motivo es concreto y ya mordió: dos paneles montados a la vez son dos grupos de
 * radios que el navegador puede tratar como uno si comparten el `name`. Pasó con la
 * simulación de visión —marcar en un bloque desmarcaba el otro y el clic «no cambiaba el
 * estado»— y se parcheó con `useId()`. Con un panel único el problema no puede volver;
 * el `useId()` se conserva igual, por si algún día el catálogo se parte en dos páginas.
 */

const ANCHOS = [390, 900, 1280] as const;

type Ancho = (typeof ANCHOS)[number];
type Tema = "claro" | "oscuro";
type Vision = Dicromacia | "normal";

const NOMBRES_VISION: Record<Dicromacia, string> = {
  protanopia: "Protanopía",
  deuteranopia: "Deuteranopía",
  tritanopia: "Tritanopía",
};

type Controles = {
  tema: Tema;
  setTema: (t: Tema) => void;
  ancho: Ancho;
  setAncho: (a: Ancho) => void;
  quieto: boolean;
  setQuieto: (q: boolean) => void;
  vision: Vision;
  setVision: (v: Vision) => void;
  forzados: boolean;
  setForzados: (f: boolean) => void;
};

const Ctx = createContext<Controles | null>(null);

/**
 * El estado del catálogo, más el panel que lo mueve y los filtros SVG de dicromacia.
 *
 * Envuelve a las secciones que comparten controles. Los filtros se montan UNA vez: son
 * `<defs>` con `id` fijo, y dos copias en el mismo documento dejan ids duplicados —el
 * segundo le roba el filtro al primero, que es exactamente el fallo que
 * `tests/unit/charts-core-ids.test.tsx` vigila para los degradados—.
 */
export function ProveedorControles({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>("claro");
  const [ancho, setAncho] = useState<Ancho>(1280);
  const [quieto, setQuieto] = useState(false);
  const [vision, setVision] = useState<Vision>("normal");
  const [forzados, setForzados] = useState(false);

  const valor = useMemo(
    () => ({
      tema,
      setTema,
      ancho,
      setAncho,
      quieto,
      setQuieto,
      vision,
      setVision,
      forzados,
      setForzados,
    }),
    [tema, ancho, quieto, vision, forzados],
  );

  return (
    <Ctx.Provider value={valor}>
      <FiltrosDicromacia />
      <PanelControles />
      {children}
    </Ctx.Provider>
  );
}

/**
 * El nombre va en inglés —`use…`— a propósito: `react-hooks/rules-of-hooks` solo reconoce
 * como hook lo que empieza por «use», y con `usarControles` el lint rechaza el `useContext`
 * de adentro. Es la única palabra en inglés de este archivo, y es por esa regla.
 */
function useControles(): Controles {
  const c = useContext(Ctx);
  if (!c) throw new Error("Falta <ProveedorControles> alrededor del catálogo");
  return c;
}

/**
 * El panel. Pegado arriba (`position: sticky`) porque el catálogo mide varias pantallas de
 * alto: con el panel al principio de la sección, mirar el estado «error» del último gráfico
 * obligaba a subir hasta el título para cambiar de tema y volver a bajar.
 */
function PanelControles() {
  const c = useControles();
  const grupo = useId();

  return (
    <div
      className="du-controles du-controles-sticky"
      role="group"
      aria-label="Controles del catálogo"
    >
      <fieldset>
        <legend>Tema</legend>
        {(["claro", "oscuro"] as const).map((t) => (
          <label key={t}>
            <input
              type="radio"
              name={`du-tema-${grupo}`}
              checked={c.tema === t}
              onChange={() => c.setTema(t)}
            />
            {t}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Ancho</legend>
        {ANCHOS.map((a) => (
          <label key={a}>
            <input
              type="radio"
              name={`du-ancho-${grupo}`}
              checked={c.ancho === a}
              onChange={() => c.setAncho(a)}
            />
            {a}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Visión</legend>
        {(["normal", ...DICROMACIAS] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name={`du-vision-${grupo}`}
              checked={c.vision === v}
              onChange={() => c.setVision(v)}
            />
            {v === "normal" ? "normal" : NOMBRES_VISION[v]}
          </label>
        ))}
      </fieldset>
      <label className="du-check">
        <input type="checkbox" checked={c.quieto} onChange={(e) => c.setQuieto(e.target.checked)} />
        Movimiento reducido
      </label>
      <label className="du-check">
        <input
          type="checkbox"
          checked={c.forzados}
          onChange={(e) => c.setForzados(e.target.checked)}
        />
        Colores forzados
      </label>
    </div>
  );
}

/**
 * El contenedor sobre el que caen los controles.
 *
 * El tema va con `data-theme` acá —no en `<html>`— para poder ver los dos a la vez sin
 * recargar. Ojo con lo que eso NO cambia: los alias (`--pos`, `--neg`, `--muted`) se
 * declaran en `:root` y se resuelven ahí, así que un `data-theme` local no los voltea; por
 * eso las primitivas usan tokens directos.
 *
 * El ancho es un `max-width`, no un viewport: sirve para ver cómo se reacomoda la rejilla,
 * no para probar media queries de verdad — eso lo hace la prueba visual, que abre el
 * navegador a 390 y a 1280.
 *
 * `data-quieto` lo lee `dev-ui.css` para apagar transiciones y animaciones DENTRO del
 * lienzo. No se toca `prefers-reduced-motion` de verdad —eso es del sistema— pero sí se
 * reproduce su efecto, que es lo que hay que poder mirar.
 */
export function LienzoCatalogo({ children }: { children: ReactNode }) {
  const c = useControles();
  return (
    <div
      className="du-lienzo"
      data-theme={c.tema === "oscuro" ? "dark" : undefined}
      data-quieto={c.quieto ? "1" : undefined}
      data-vision={c.vision === "normal" ? undefined : c.vision}
      data-forzados={c.forzados ? "1" : undefined}
      style={{
        maxWidth: c.ancho,
        ...(c.vision === "normal" ? {} : { filter: `url(#sim-${c.vision})` }),
      }}
    >
      {children}
    </div>
  );
}
