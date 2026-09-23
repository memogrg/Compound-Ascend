"use client";

import { formatMoney } from "@/lib/format";

import { DeltaChip, type SentidoBueno } from "./delta-chip";
import { digitosNumero, partesNumero } from "./numero-animado";
import { Sparkline } from "./sparkline";

/**
 * La misma información que el hero, en el tamaño de una fila de tarjetas.
 *
 * Acá el número NO se anima: cuatro tarjetas animando a la vez convierten un cambio de
 * periodo en un espectáculo y le quitan el foco a la cifra que sí importa. Se anima una
 * sola cosa por pantalla — el hero — y el resto se actualiza en seco.
 *
 * El valor se parte en las mismas tres piezas que el hero —signo, símbolo y dígitos— para
 * que el símbolo se atenúe igual; la cadena completa sigue saliendo de `formatMoney` y va
 * en el `sr-only`, que es lo que se anuncia.
 */
export function KpiCard({
  etiqueta,
  valor,
  moneda = "CRC",
  decimales,
  nota,
  delta,
  puntos,
}: {
  etiqueta: string;
  valor: number;
  moneda?: string;
  decimales?: number;
  nota?: string;
  delta?: { valor: number; vsEtiqueta?: string; sentidoBueno: SentidoBueno };
  puntos?: readonly number[];
}) {
  const partes = partesNumero(valor, moneda, decimales);

  return (
    <div className="kpi-card">
      <p className="kpi-card-etiqueta">{etiqueta}</p>
      <p className="kpi-card-cifra tnum">
        <span className="sr-only">{formatMoney(valor, moneda, decimales)}</span>
        <span aria-hidden="true">
          <span className="kpi-cifra-signo">{partes.signo}</span>
          <span className="kpi-cifra-simbolo">{partes.simbolo}</span>
          {digitosNumero(partes)}
        </span>
      </p>
      {delta ? (
        <DeltaChip
          valor={delta.valor}
          moneda={moneda}
          vsEtiqueta={delta.vsEtiqueta}
          sentidoBueno={delta.sentidoBueno}
        />
      ) : null}
      {puntos ? <Sparkline puntos={puntos} ancho={64} alto={20} /> : null}
      {nota ? <p className="kpi-card-nota">{nota}</p> : null}
    </div>
  );
}
