"use client";

import { formatMoney } from "@/lib/format";

import { DeltaChip, type SentidoBueno } from "./delta-chip";
import { Sparkline } from "./sparkline";

/**
 * La misma información que el hero, en el tamaño de una fila de tarjetas.
 *
 * Acá el número NO se anima: cuatro tarjetas animando a la vez convierten un cambio de
 * periodo en un espectáculo y le quitan el foco a la cifra que sí importa. Se anima una
 * sola cosa por pantalla — el hero — y el resto se actualiza en seco.
 *
 * El valor se escribe con el mismo `formatMoney` que el hero, así que las cifras de la
 * fila y la del hero son tipográficamente la misma familia.
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
  return (
    <div className="kpi-card">
      <p className="kpi-card-etiqueta">{etiqueta}</p>
      <p className="kpi-card-cifra tnum">{formatMoney(valor, moneda, decimales)}</p>
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
