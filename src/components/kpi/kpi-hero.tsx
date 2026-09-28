"use client";

import NumberFlow from "@number-flow/react";
import { EstadoCifra } from "./estado-kpi";

import { formatMoney } from "@/lib/format";

import { DeltaChip, type SentidoBueno } from "./delta-chip";
import { Meter, type UmbralesMeter } from "./meter";
import { partesNumero, textoNumero } from "./numero-animado";
import { Sparkline } from "./sparkline";

/**
 * La cifra que contesta la pregunta de la pantalla, en grande, con su contexto alrededor.
 *
 * Tres decisiones:
 *
 *  - **El número se anima, el significado no.** NumberFlow mueve los dígitos cuando el valor
 *    cambia; el texto que queda al final es carácter a carácter el de `formatMoney` (ver
 *    `numero-animado.ts`), porque un hero que dice «₡1 234 567» al lado de una tarjeta que
 *    dice «₡1.234.567» es una app que no se pone de acuerdo consigo misma.
 *  - **El valor también va en texto plano**, en un `sr-only`, y el `<number-flow>` queda
 *    `aria-hidden`. El elemento parte el número en decenas de `<span>` por dígito: un lector
 *    de pantalla leería «uno, punto, dos, tres, cuatro». La cifra se anuncia una vez y entera.
 *  - **Reduced motion lo apaga solo**: NumberFlow trae `respectMotionPreference` activo por
 *    defecto, así que con la preferencia puesta el número aparece ya escrito. No hace falta
 *    ramificar el render —y no conviene, porque ramificar entre servidor y cliente es
 *    exactamente lo que produce un desajuste de hidratación.
 */
export function KpiHero({
  etiqueta,
  valor,
  moneda = "CRC",
  decimales,
  nota,
  delta,
  puntos,
  medidor,
  cargando,
  error,
}: {
  /** Qué mide, en palabras. Va arriba, pequeño: la cifra sin sujeto no informa. */
  etiqueta: string;
  valor: number;
  moneda?: string;
  decimales?: number;
  /** Una línea de contexto debajo: el periodo, el supuesto, la fuente. */
  nota?: string;
  delta?: { valor: number; vsEtiqueta?: string; sentidoBueno: SentidoBueno };
  /** 12 puntos de tendencia. Decorativos: el dato está en la cifra. */
  puntos?: readonly number[];
  medidor?: { valor: number; etiqueta: string; max?: number; umbrales?: UmbralesMeter };
  /** Todavía no llegó el dato. El marco NO cambia de alto: ver `estado-kpi.tsx`. */
  cargando?: boolean;
  /** No se pudo calcular. Se dice en el lugar de la cifra, sin mover nada. */
  error?: string;
}) {
  const partes = partesNumero(valor, moneda, decimales);
  const texto = formatMoney(valor, moneda, decimales);
  const sinDato = Boolean(cargando || error);

  return (
    <div className="kpi-hero">
      <p className="kpi-hero-etiqueta">{etiqueta}</p>

      <p className="kpi-hero-cifra">
        <EstadoCifra cargando={cargando} error={error}>
          <>
            {/* El número entero, una sola vez, para quien escucha la pantalla. */}
            <span className="sr-only">{texto}</span>
            {/* El signo y el símbolo se pintan acá y NO se le pasan a NumberFlow como `prefix`:
            dentro de su shadow root no hay forma de darles un tamaño ni un color propios.
            El símbolo se atenúa y se achica —es la unidad, no el dato—; el signo conserva
            el peso y el color, que para eso indica que el número es negativo. */}
            <span aria-hidden="true" className="kpi-cifra-signo">
              {partes.signo}
            </span>
            <span aria-hidden="true" className="kpi-cifra-simbolo">
              {partes.simbolo}
            </span>
            <NumberFlow
              aria-hidden="true"
              value={partes.valor}
              locales={partes.locales}
              format={partes.format}
              // Sin `isolate`, el ancho del hero empujaría el layout en cada tick.
              isolate
              willChange
            />
          </>
        </EstadoCifra>
      </p>

      {/* Sin dato no hay delta, ni tendencia, ni medidor: serían una comparación, una curva y
          un progreso inventados sobre un número que no existe. La NOTA sí se queda — dice qué
          se está midiendo, y eso sigue siendo cierto mientras carga.
       *
       * Pero el SITIO se reserva. Quitar la fila entera encogía la tarjeta 45 px, así que la
       * página daba el salto exacto que este estado venía a evitar — lo midió el caso
       * «el esqueleto NO mueve el marco», que falló con «con datos 152,25 px · cargando
       * 107,02 px». Lo que cambia es el contenido de la fila, nunca su existencia. */}
      {(delta || puntos) && sinDato ? (
        // La MISMA fila que con datos, con el contenido real invisible: así el alto no puede
        // separarse. La barra gris va solo sobre la cifra.
        <div className="kpi-hero-contexto" aria-hidden="true">
          {delta ? (
            <span className="kpi-velado">
              <DeltaChip
                valor={delta.valor}
                moneda={moneda}
                vsEtiqueta={delta.vsEtiqueta}
                sentidoBueno={delta.sentidoBueno}
              />
            </span>
          ) : null}
          {puntos ? (
            <span className="kpi-velado">
              <Sparkline puntos={puntos} />
            </span>
          ) : null}
        </div>
      ) : null}

      {(delta || puntos) && !sinDato ? (
        <div className="kpi-hero-contexto">
          {delta ? (
            <DeltaChip
              valor={delta.valor}
              moneda={moneda}
              vsEtiqueta={delta.vsEtiqueta}
              sentidoBueno={delta.sentidoBueno}
            />
          ) : null}
          {puntos ? <Sparkline puntos={puntos} /> : null}
        </div>
      ) : null}

      {medidor && sinDato ? (
        <div className="kpi-hero-medidor kpi-velado" aria-hidden="true">
          <Meter
            valor={medidor.valor}
            max={medidor.max}
            etiqueta={medidor.etiqueta}
            umbrales={medidor.umbrales}
          />
          <p className="kpi-hero-nota">{medidor.etiqueta}</p>
        </div>
      ) : null}

      {medidor && !sinDato ? (
        <div className="kpi-hero-medidor">
          <Meter
            valor={medidor.valor}
            max={medidor.max}
            etiqueta={medidor.etiqueta}
            umbrales={medidor.umbrales}
          />
          <p className="kpi-hero-nota">{medidor.etiqueta}</p>
        </div>
      ) : null}

      {nota ? <p className="kpi-hero-nota">{nota}</p> : null}
    </div>
  );
}

/** El texto exacto que mostrará el hero. Lo usan los tests y el respaldo sin animación. */
export function textoHero(valor: number, moneda = "CRC", decimales?: number): string {
  return textoNumero(partesNumero(valor, moneda, decimales));
}
