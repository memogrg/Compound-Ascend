"use client";

import { useState, type ReactNode } from "react";

import { KpiHero, KpiCard, DeltaChip, Sparkline, Meter } from "@/components/kpi";
import {
  ActionStrip,
  BreakdownCard,
  InsightList,
  SectionHeader,
  type FilaDesglose,
  type InsightItem,
} from "@/components/lectura";

/**
 * La matriz de ESTADOS de las nueve primitivas de KPI y lectura (delta 2.6a).
 *
 * Por qué existe: una primitiva se diseña con su estado feliz y se rompe en los otros siete.
 * El caso que más duele no es el vacío —ese se ve enseguida— sino **cargando**: un esqueleto
 * de otro alto que el contenido empuja la página entera cuando llega el dato. Nos costó una
 * medición de determinismo completa (`/mi-rich-life` en 2196 px y 2102 px entre dos capturas
 * de la MISMA compilación, porque en una las donas habían montado y en la otra no), y por eso
 * cada entrada de «cargando» está al lado de su estado con datos: si el marco salta, se ve.
 *
 * Los ocho estados, y qué pregunta contesta cada uno:
 *
 *   con datos          · lo normal
 *   vacío              · ¿dice algo ÚTIL, o solo «sin datos»?
 *   cargando           · ¿conserva el marco?
 *   error              · ¿lo dice sin gritar y sin inventar una cifra?
 *   negativos          · ¿el signo y el color siguen significando lo mismo?
 *   miles de millones  · ¿cabe, o desborda la tarjeta?
 *   rótulos largos     · ¿corta, envuelve, o rompe la rejilla?
 *   período en curso    · ¿avisa que el número todavía se está formando?
 *
 * Todo es constante y local: esta página no lee ni escribe nada.
 */

const PUNTOS = [820, 910, 875, 1040, 990, 1120, 1080, 1210, 1160, 1290, 1180, 1234] as const;
const PUNTOS_BAJA = [
  1290, 1180, 1234, 1310, 1220, 1150, 1090, 1140, 1020, 1060, 1005, 987,
] as const;

/** Un rótulo que ninguna tarjeta espera. No es humor: los sobres los nombra el usuario. */
const ROTULO_LARGO =
  "Aporte mensual al fondo de emergencia de la familia (revisión trimestral acordada en enero)";

const FILAS: readonly FilaDesglose[] = [
  { id: "f1", etiqueta: "Supermercado", valor: 285_400 },
  { id: "f2", etiqueta: "Restaurantes", valor: 141_900 },
  { id: "f3", etiqueta: "Transporte", valor: 96_250 },
];

const FILAS_LARGAS: readonly FilaDesglose[] = [
  { id: "g1", etiqueta: ROTULO_LARGO, valor: 285_400 },
  {
    id: "g2",
    etiqueta: "Suscripciones digitales, streaming y servicios de la casa",
    valor: 41_900,
  },
];

const INSIGHTS: readonly InsightItem[] = [
  {
    id: "i1",
    severidad: "accionar",
    titulo: "Vas rápido en Restaurantes",
    causa: "Llevás ₡141.900 de ₡120.000 y es el día 17. A este ritmo llegás a ₡250.000.",
  },
  {
    id: "i2",
    severidad: "observar",
    titulo: "Tu fondo de paz",
    causa: "Hoy cubriría 0 de 3 meses de tus gastos esenciales.",
  },
];

/* ── Andamiaje de la galería ────────────────────────────────────────────────── */

/**
 * Una entrada del catálogo: ancla, título, nota de uso de UNA línea y la especificación
 * completa detrás de un «?».
 *
 * El ancla importa más de lo que parece: es lo que permite mandar un enlace a la entrada
 * exacta en una discusión de diseño, en vez de decir «bajá hasta la mitad».
 */
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
  children: ReactNode;
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
        <EspecTip texto={spec} titulo={titulo} />
      </div>
      <p className="du-entrada-nota">{nota}</p>
      <div className="du-matriz">{children}</div>
    </section>
  );
}

/**
 * La especificación, detrás de un «?».
 *
 * `<details>`/`<summary>` y no un tooltip al pasar el mouse: se abre con teclado, no
 * desaparece al mover la mano, y se queda abierto para leerlo. Un tooltip de hover no es
 * accesible y además no se puede capturar en una prueba visual sin simular el puntero.
 */
function EspecTip({ texto, titulo }: { texto: string; titulo: string }) {
  return (
    <details className="du-spec">
      <summary aria-label={`Especificación de ${titulo}`}>?</summary>
      <p>{texto}</p>
    </details>
  );
}

/** Una celda de la matriz: el estado, rotulado. Sin rótulo, una captura no dice cuál es. */
function Estado({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="du-estado" data-estado={nombre}>
      <p className="du-estado-rotulo">{nombre}</p>
      <div className="du-estado-caja">{children}</div>
    </div>
  );
}

/* ── Controles de la página ─────────────────────────────────────────────────── */

const ANCHOS = [390, 900, 1280] as const;

/**
 * Tema, ancho y `prefers-reduced-motion`, aplicados al CONTENEDOR del catálogo.
 *
 * El tema va con `data-theme` en el contenedor —no en `<html>`— para poder ver los dos a la
 * vez sin recargar. Ojo con lo que eso NO cambia: los alias (`--pos`, `--neg`, `--muted`) se
 * declaran en `:root` y se resuelven ahí, así que un `data-theme` local no los voltea; por eso
 * las primitivas usan tokens directos. Está escrito en la sección de color de esta misma
 * galería, y es la razón por la que ese detalle se documenta y no se «arregla».
 *
 * El ancho es un `max-width` sobre el contenedor, no un viewport: sirve para ver cómo se
 * reacomoda la rejilla, no para probar media queries de verdad —eso lo hace la prueba visual,
 * que abre el navegador a 390 y a 1280—.
 */
function Controles({
  tema,
  setTema,
  ancho,
  setAncho,
  quieto,
  setQuieto,
}: {
  tema: "claro" | "oscuro";
  setTema: (t: "claro" | "oscuro") => void;
  ancho: (typeof ANCHOS)[number];
  setAncho: (a: (typeof ANCHOS)[number]) => void;
  quieto: boolean;
  setQuieto: (q: boolean) => void;
}) {
  return (
    <div className="du-controles" role="group" aria-label="Controles del catálogo">
      <fieldset>
        <legend>Tema</legend>
        {(["claro", "oscuro"] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="du-tema" checked={tema === t} onChange={() => setTema(t)} />
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
              name="du-ancho"
              checked={ancho === a}
              onChange={() => setAncho(a)}
            />
            {a}
          </label>
        ))}
      </fieldset>
      <label className="du-check">
        <input type="checkbox" checked={quieto} onChange={(e) => setQuieto(e.target.checked)} />
        Movimiento reducido
      </label>
    </div>
  );
}

/* ── La sección ─────────────────────────────────────────────────────────────── */

export function EstadosDemo() {
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");
  const [ancho, setAncho] = useState<(typeof ANCHOS)[number]>(1280);
  const [quieto, setQuieto] = useState(false);

  return (
    <>
      <Controles
        tema={tema}
        setTema={setTema}
        ancho={ancho}
        setAncho={setAncho}
        quieto={quieto}
        setQuieto={setQuieto}
      />

      <div
        className="du-lienzo"
        data-theme={tema === "oscuro" ? "dark" : undefined}
        /* `data-quieto` lo lee `dev-ui.css` para apagar transiciones y animaciones DENTRO del
           lienzo. No se toca `prefers-reduced-motion` de verdad —eso es del sistema— pero sí se
           reproduce su efecto, que es lo que hay que poder mirar. */
        data-quieto={quieto ? "1" : undefined}
        style={{ maxWidth: ancho }}
      >
        <Entrada
          id="kpi-hero"
          titulo="KpiHero"
          nota="La cifra principal de una pantalla. Una por pantalla: si hay dos, ninguna es la principal."
          spec="Cifra 42px (34px a ≤540px), font-display, peso 600. Etiqueta arriba en 12px mayúsculas. Delta y sparkline solo con dato. Cargando: esqueleto de 1em dentro del mismo renglón — el marco no cambia de alto. Error: role=status, nunca alert."
        >
          <Estado nombre="con datos">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={1_234_567}
              delta={{ valor: 120_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS}
              nota="del mes · presupuesto"
            />
          </Estado>
          <Estado nombre="vacío">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={0}
              nota="Todavía no registraste ingresos ni gastos de este mes."
            />
          </Estado>
          <Estado nombre="cargando">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={1_234_567}
              delta={{ valor: 120_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS}
              nota="del mes · presupuesto"
              cargando
            />
          </Estado>
          <Estado nombre="error">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={0}
              nota="del mes · presupuesto"
              error="No se pudo calcular"
            />
          </Estado>
          <Estado nombre="negativos">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={-486_300}
              delta={{ valor: -212_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS_BAJA}
              nota="Gastaste más de lo que entró."
            />
          </Estado>
          <Estado nombre="miles de millones">
            <KpiHero
              etiqueta="Patrimonio neto"
              valor={12_480_935_600}
              delta={{ valor: 1_240_000_000, sentidoBueno: "arriba" }}
              nota="al 17 de septiembre"
            />
          </Estado>
          <Estado nombre="rótulo largo">
            <KpiHero etiqueta={ROTULO_LARGO} valor={200_000} nota="del mes · presupuesto" />
          </Estado>
          <Estado nombre="período en curso">
            <KpiHero
              etiqueta="Flujo libre del mes"
              valor={612_400}
              delta={{ valor: 42_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS.slice(0, 6)}
              nota="del mes en curso · quedan 13 días"
            />
          </Estado>
        </Entrada>

        <Entrada
          id="kpi-card"
          titulo="KpiCard"
          nota="Cifras secundarias en rejilla. Todas del mismo período, o el rótulo lo dice."
          spec="Cifra 23px. Delta y sparkline opcionales y solo con dato. Misma regla de marco que KpiHero. En rejilla, el alto lo fija la tarjeta más alta: un rótulo largo no puede desalinear la fila."
        >
          <Estado nombre="con datos">
            <KpiCard
              etiqueta="Ingresos"
              valor={2_850_000}
              delta={{ valor: 120_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS}
              nota="del mes"
            />
          </Estado>
          <Estado nombre="vacío">
            <KpiCard etiqueta="Ingresos" valor={0} nota="Sin ingresos registrados este mes." />
          </Estado>
          <Estado nombre="cargando">
            <KpiCard
              etiqueta="Ingresos"
              valor={2_850_000}
              delta={{ valor: 120_000, sentidoBueno: "arriba" }}
              puntos={PUNTOS}
              nota="del mes"
              cargando
            />
          </Estado>
          <Estado nombre="error">
            <KpiCard etiqueta="Ingresos" valor={0} nota="del mes" error="Sin conexión" />
          </Estado>
          <Estado nombre="negativos">
            <KpiCard
              etiqueta="Ahorro del mes"
              valor={-45_000}
              delta={{ valor: -90_000, sentidoBueno: "arriba" }}
              nota="del mes"
            />
          </Estado>
          <Estado nombre="miles de millones">
            <KpiCard etiqueta="Inversiones" valor={9_874_500_300} nota="valor de mercado" />
          </Estado>
          <Estado nombre="rótulo largo">
            <KpiCard etiqueta={ROTULO_LARGO} valor={200_000} nota="del mes" />
          </Estado>
          <Estado nombre="período en curso">
            <KpiCard etiqueta="Gastos" valor={1_167_030} nota="del mes en curso · día 17 de 30" />
          </Estado>
        </Entrada>

        <Entrada
          id="delta-chip"
          titulo="DeltaChip"
          nota="El cambio respecto a un período anterior. El color lo decide si subir es bueno, no el signo."
          spec="Flecha ↑ ↓ →, valor con signo, y «vs …» opcional. El mismo «+» va verde en Ingresos y rojo en Gastos: lo decide `sentidoBueno`. Lectura para lector de pantalla («sube», «baja», «igual»), no solo la flecha. Sin estado propio de carga: su anfitrión lo oculta mientras no haya dato."
        >
          <Estado nombre="con datos">
            <DeltaChip valor={120_000} sentidoBueno="arriba" />
          </Estado>
          <Estado nombre="vacío">
            <DeltaChip valor={0} sentidoBueno="arriba" />
          </Estado>
          <Estado nombre="cargando">
            <p className="du-vacio">No se pinta: sin cifra no hay comparación.</p>
          </Estado>
          <Estado nombre="error">
            <p className="du-vacio">No se pinta: sin cifra no hay comparación.</p>
          </Estado>
          <Estado nombre="negativos">
            <DeltaChip valor={-212_000} sentidoBueno="arriba" />
          </Estado>
          <Estado nombre="miles de millones">
            <DeltaChip valor={1_240_000_000} sentidoBueno="arriba" />
          </Estado>
          <Estado nombre="rótulo largo">
            <DeltaChip
              valor={84_000}
              sentidoBueno="abajo"
              vsEtiqueta="vs el promedio de los últimos seis meses cerrados"
            />
          </Estado>
          <Estado nombre="período en curso">
            <DeltaChip
              valor={42_000}
              sentidoBueno="arriba"
              vsEtiqueta="vs el mismo día del mes pasado"
            />
          </Estado>
        </Entrada>

        <Entrada
          id="sparkline"
          titulo="Sparkline"
          nota="La forma de la tendencia, no sus valores. Decorativa: el dato está en la cifra."
          spec="12 puntos, `aria-hidden`. Punto final marcado. Sin ejes ni etiquetas — si hacen falta, es un gráfico, no una sparkline. Con menos de 2 puntos no se dibuja."
        >
          <Estado nombre="con datos">
            <Sparkline puntos={PUNTOS} />
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
            <Sparkline puntos={[-120, -80, -140, -60, -180, -40, -90, -30, -110, -20, -70, -10]} />
          </Estado>
          <Estado nombre="miles de millones">
            <Sparkline puntos={PUNTOS.map((p) => p * 1_000_000)} />
          </Estado>
          <Estado nombre="rótulo largo">
            <p className="du-vacio">No aplica: no lleva rótulo.</p>
          </Estado>
          <Estado nombre="período en curso">
            <Sparkline puntos={PUNTOS.slice(0, 6)} />
          </Estado>
        </Entrada>

        <Entrada
          id="meter"
          titulo="Meter"
          nota="Cuánto de un presupuesto o un objetivo se lleva consumido. Nunca para una tendencia."
          spec="0-100 % con umbrales (aviso 80, peligro 100 por defecto). El color es señal, no decoración, así que el texto dice el porcentaje: el color no puede ser el único canal. Pasado el 100 % la barra se queda llena y el número sigue subiendo."
        >
          <Estado nombre="con datos">
            <Meter valor={43} etiqueta="Supermercado" />
          </Estado>
          <Estado nombre="vacío">
            <Meter valor={0} etiqueta="Supermercado" />
          </Estado>
          <Estado nombre="cargando">
            <div className="skel" style={{ height: 8, width: "100%", borderRadius: 4 }} />
          </Estado>
          <Estado nombre="error">
            <p className="du-vacio">Sin presupuesto no hay porcentaje que mostrar.</p>
          </Estado>
          <Estado nombre="negativos">
            <Meter valor={-10} etiqueta="Saldo del sobre" />
          </Estado>
          <Estado nombre="miles de millones">
            <Meter valor={100} max={100} etiqueta="Objetivo alcanzado" />
          </Estado>
          <Estado nombre="rótulo largo">
            <Meter valor={62} etiqueta={ROTULO_LARGO} />
          </Estado>
          <Estado nombre="período en curso">
            <Meter valor={118} etiqueta="Restaurantes · día 17 de 30" />
          </Estado>
        </Entrada>

        <Entrada
          id="section-header"
          titulo="SectionHeader"
          nota="Encabeza una franja. El eyebrow dice de qué habla; el título, qué se ve."
          spec="h2 o h3 según `nivel` — el nivel es jerarquía del documento, no tamaño. Eyebrow en 11px mayúsculas con `letter-spacing`; NUNCA se llama `overline` (choca con la utilidad de Tailwind). `ayuda` y `toolbar` a la derecha."
        >
          <Estado nombre="con datos">
            <SectionHeader eyebrow="Gastos" titulo="Composición del mes" />
          </Estado>
          <Estado nombre="vacío">
            <SectionHeader titulo="Composición del mes" />
          </Estado>
          <Estado nombre="cargando">
            <SectionHeader eyebrow="Gastos" titulo="Composición del mes" />
          </Estado>
          <Estado nombre="error">
            <SectionHeader eyebrow="Gastos" titulo="Composición del mes" />
          </Estado>
          <Estado nombre="negativos">
            <p className="du-vacio">No aplica: no muestra cifras.</p>
          </Estado>
          <Estado nombre="miles de millones">
            <p className="du-vacio">No aplica: no muestra cifras.</p>
          </Estado>
          <Estado nombre="rótulo largo">
            <SectionHeader eyebrow="Presupuesto y gasto real por bloque" titulo={ROTULO_LARGO} />
          </Estado>
          <Estado nombre="período en curso">
            <SectionHeader eyebrow="Gastos" titulo="Composición del mes en curso" />
          </Estado>
        </Entrada>

        <Entrada
          id="breakdown-card"
          titulo="BreakdownCard"
          nota="De qué está hecho un total. Se puede entrar a una fila; el resto de la pantalla sigue ese foco."
          spec="Filas ordenadas de mayor a menor, con barra proporcional al máximo. `cargando` conserva el alto de las filas. `vacio` recibe un mensaje ÚTIL —qué hacer—, no «sin datos». Entrar a una fila es un foco: quien la usa tiene que reflejarlo en el resto de la pantalla."
        >
          <Estado nombre="con datos">
            <BreakdownCard filas={FILAS} total={523_550} />
          </Estado>
          <Estado nombre="vacío">
            <BreakdownCard
              filas={[]}
              vacio="Agregá tu primer gasto y acá vas a ver de qué está hecho el mes."
            />
          </Estado>
          <Estado nombre="cargando">
            <BreakdownCard filas={[]} cargando />
          </Estado>
          <Estado nombre="error">
            <BreakdownCard filas={[]} vacio="No se pudo cargar el desglose. Probá de nuevo." />
          </Estado>
          <Estado nombre="negativos">
            <BreakdownCard
              filas={[
                { id: "n1", etiqueta: "Reintegro de seguro", valor: -84_000 },
                { id: "n2", etiqueta: "Supermercado", valor: 285_400 },
              ]}
            />
          </Estado>
          <Estado nombre="miles de millones">
            <BreakdownCard
              filas={[
                { id: "m1", etiqueta: "Inmuebles", valor: 8_400_000_000 },
                { id: "m2", etiqueta: "Fondos", valor: 3_100_000_000 },
              ]}
            />
          </Estado>
          <Estado nombre="rótulo largo">
            <BreakdownCard filas={FILAS_LARGAS} />
          </Estado>
          <Estado nombre="período en curso">
            <BreakdownCard filas={FILAS} total={523_550} />
          </Estado>
        </Entrada>

        <Entrada
          id="insight-list"
          titulo="InsightList"
          nota="Lo que un asesor señalaría. Ordenadas por severidad; el vacío es una buena noticia."
          spec="Severidades: accionar, observar, celebrar, info — cada una con su icono, porque el color no puede ser el único canal. `max` corta la lista: una campana con quince avisos no se lee. El vacío dice «no hay nada que señalar», que es información, no un error."
        >
          <Estado nombre="con datos">
            <InsightList items={INSIGHTS} />
          </Estado>
          <Estado nombre="vacío">
            <InsightList items={[]} vacio="Nada que señalar esta semana. Vas al día." />
          </Estado>
          <Estado nombre="cargando">
            <div className="skel" style={{ height: 96, width: "100%", borderRadius: 10 }} />
          </Estado>
          <Estado nombre="error">
            <InsightList items={[]} vacio="No se pudieron cargar las señales." />
          </Estado>
          <Estado nombre="negativos">
            <InsightList
              items={[
                {
                  id: "x1",
                  severidad: "accionar",
                  titulo: "Tu flujo libre quedó en negativo",
                  causa: "Gastaste ₡486.300 más de lo que entró.",
                },
              ]}
            />
          </Estado>
          <Estado nombre="miles de millones">
            <InsightList
              items={[
                {
                  id: "x2",
                  severidad: "celebrar",
                  titulo: "Tu patrimonio pasó los ₡12.000 millones",
                  causa: "Subió ₡1.240 millones respecto al mes pasado.",
                },
              ]}
            />
          </Estado>
          <Estado nombre="rótulo largo">
            <InsightList
              items={[
                { id: "x3", severidad: "observar", titulo: ROTULO_LARGO, causa: ROTULO_LARGO },
              ]}
            />
          </Estado>
          <Estado nombre="período en curso">
            <InsightList items={INSIGHTS.slice(0, 1)} />
          </Estado>
        </Entrada>

        <Entrada
          id="action-strip"
          titulo="ActionStrip"
          nota="La salida de una franja: una acción principal, y por qué otra está bloqueada."
          spec="Una sola acción principal. La bloqueada se muestra con su MOTIVO —un botón gris sin explicación es una pared— y el enlace al asesor va último. Nunca dos primarios."
        >
          <Estado nombre="con datos">
            <ActionStrip
              principal={{ etiqueta: "Ajustar el presupuesto", href: "#" }}
              asesor={{ pregunta: "¿Por qué me recomendás ajustar el presupuesto ahora?" }}
            />
          </Estado>
          <Estado nombre="vacío">
            <p className="du-vacio">Sin acciones: la franja no ofrece salida.</p>
          </Estado>
          <Estado nombre="cargando">
            <div className="skel" style={{ height: 36, width: 220, borderRadius: 8 }} />
          </Estado>
          <Estado nombre="error">
            <ActionStrip principal={{ etiqueta: "Reintentar", href: "#" }} />
          </Estado>
          <Estado nombre="negativos">
            <ActionStrip
              principal={{ etiqueta: "Ver de dónde salió el faltante", href: "#" }}
              bloqueada={{ motivo: "No hay sobres con holgura este mes." }}
            />
          </Estado>
          <Estado nombre="miles de millones">
            <p className="du-vacio">No aplica: no muestra cifras.</p>
          </Estado>
          <Estado nombre="rótulo largo">
            <ActionStrip
              principal={{
                etiqueta: "Ajustar el presupuesto del fondo de emergencia de la familia",
                href: "#",
              }}
              bloqueada={{
                motivo:
                  "Solo se pueden fusionar sobres del mismo frasco, y este no tiene hermanos.",
              }}
            />
          </Estado>
          <Estado nombre="período en curso">
            <ActionStrip principal={{ etiqueta: "Cerrar el mes", href: "#" }} />
          </Estado>
        </Entrada>
      </div>
    </>
  );
}
