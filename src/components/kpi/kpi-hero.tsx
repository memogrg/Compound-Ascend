"use client";

import NumberFlow from "@number-flow/react";

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
}) {
  const partes = partesNumero(valor, moneda, decimales);
  const texto = formatMoney(valor, moneda, decimales);

  return (
    <div className="kpi-hero">
      <p className="kpi-hero-etiqueta">{etiqueta}</p>

      <p className="kpi-hero-cifra">
        {/* El número entero, una sola vez, para quien escucha la pantalla. */}
        <span className="sr-only">{texto}</span>
        <NumberFlow
          aria-hidden="true"
          value={partes.valor}
          locales={partes.locales}
          format={partes.format}
          prefix={partes.prefijo}
          // Sin `isolate`, el ancho del hero empujaría el layout en cada tick.
          isolate
          willChange
        />
      </p>

      {delta || puntos ? (
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

      {medidor ? (
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
