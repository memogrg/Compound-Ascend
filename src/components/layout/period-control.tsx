"use client";

/**
 * Selector de periodo GLOBAL de la barra superior v2 (03-navigation §«Barra superior»):
 * el único control de tiempo de la app, persistido en la URL.
 */
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { comparisonParser, periodParser, COMPARISON_MODES } from "@/lib/url-state/period";
import {
  buildOptions,
  currentOption,
  labelPeriodo,
  puedeAvanzar,
  puedeRetroceder,
  shiftPeriodo,
} from "@/lib/url-state/period-options";

/** Etiquetas de los modos de `comparisonParser`. La lista sigue siendo la del parser. */
const COMPARACION: Record<(typeof COMPARISON_MODES)[number], string> = {
  prev: "vs mes anterior",
  yoy: "vs mismo mes del año pasado",
  budget: "vs presupuesto",
  avg3: "vs promedio 3 m",
};

export function PeriodControl({ defaultPeriod }: { defaultPeriod: string }) {
  // `shallow: false` NO es opcional: las páginas de (dashboard) son server components que
  // leen `searchParams.period`. Con el shallow por defecto, nuqs cambiaría la URL sin
  // pedirle nada al servidor y el contenido se quedaría en el mes anterior.
  const [periodUrl, setPeriod] = useQueryState(
    "period",
    periodParser.withOptions({ shallow: false, history: "push" }),
  );
  const [vs, setVs] = useQueryState("vs", comparisonParser.withOptions({ shallow: false }));

  // Sin `?period=` manda el mes del USUARIO, que resuelve el servidor: derivarlo acá usaría
  // el reloj del navegador y le mostraría otro mes a quien viaja.
  const period = periodUrl ?? defaultPeriod;

  // La ventana de meses se ancla a `new Date()` del cliente, así que el primer render solo
  // ofrece el mes seleccionado y se expande tras montar. Mismo motivo que en
  // `PeriodSelector`: un `<select>` con distinto número de `<option>` en servidor y cliente
  // es un desajuste de hidratación.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const opciones = montado ? buildOptions(period) : [currentOption(period)];

  // Antes de montar no se sabe cuál es el mes real, así que la flecha de avanzar se deja
  // habilitada y se corrige al instante: apagarla por defecto bloquearía un clic legítimo.
  const avanzar = montado ? puedeAvanzar(period) : true;
  const retroceder = puedeRetroceder(period);

  const ir = (delta: number) => setPeriod(shiftPeriodo(period, delta));

  return (
    <div className="tb2-period" role="group" aria-label="Periodo">
      <button
        type="button"
        className="tb2-arrow"
        onClick={() => ir(-1)}
        disabled={!retroceder}
        aria-label="Mes anterior"
        title="Mes anterior"
      >
        <Icon name="chev" />
      </button>

      {/* El `<select>` cubre toda la etiqueta: se ve como texto y se comporta como menú,
          que es el patrón del prototipo. El texto visible es un hermano, no el `<select>`,
          porque un select no se puede estilar por dentro de forma fiable. */}
      <span className="tb2-period-label">
        <span aria-hidden>{labelPeriodo(period)}</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Elegir mes">
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>

      <button
        type="button"
        className="tb2-arrow"
        onClick={() => ir(1)}
        disabled={!avanzar}
        aria-label="Mes siguiente"
        title="Mes siguiente"
      >
        <Icon name="chev" />
      </button>

      {/* Solo escribe `?vs=` en la URL: todavía no hay ningún consumidor. Entra aquí para
          que el contrato quede fijado antes de que las pantallas lo lean. */}
      <span className="tb2-cmp">
        <span aria-hidden>{COMPARACION[vs]}</span>
        {/* El `value` de un `<select>` es `string`; el parser espera uno de los cuatro
            literales. Se valida contra la lista en vez de castear: si alguien agrega un
            modo al parser y olvida la etiqueta, el select simplemente no lo ofrece. */}
        <select
          value={vs}
          onChange={(e) => {
            const v = COMPARISON_MODES.find((m) => m === e.target.value);
            if (v) void setVs(v);
          }}
          aria-label="Comparar con"
        >
          {COMPARISON_MODES.map((m) => (
            <option key={m} value={m}>
              {COMPARACION[m]}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
