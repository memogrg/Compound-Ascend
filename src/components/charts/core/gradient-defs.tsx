"use client";

import { useId } from "react";

import type { SerieDef } from "./theme";

/**
 * Un `<linearGradient>` vertical por serie, del color de la serie a transparente.
 *
 * El relleno es una LAVADA, no un bloque: arranca en `--chart-gradient-top` (0,28) y muere en
 * `--chart-gradient-bottom` (0). Un área opaca tapa la rejilla y, con dos series superpuestas,
 * la de abajo deja de existir.
 *
 * Los ids salen de `useId()`. Sin eso, dos gráficos en la misma página declaran
 * `#grad-1` los dos y el segundo le roba el degradado al primero — un fallo que solo aparece
 * cuando alguien pone dos gráficos juntos, que es justo lo que hace `/dev/ui`.
 */
export function useGradientIds(series: readonly SerieDef[]): Record<string, string> {
  const base = useId();
  return Object.fromEntries(series.map((s) => [s.clave, `cf-grad-${base}-${s.clave}`]));
}

export function GradientDefs({
  series,
  ids,
}: {
  series: readonly SerieDef[];
  ids: Record<string, string>;
}) {
  return (
    <defs>
      {series.map((s) => (
        <linearGradient key={s.clave} id={ids[s.clave]} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.color} stopOpacity="var(--chart-gradient-top)" />
          <stop offset="100%" stopColor={s.color} stopOpacity="var(--chart-gradient-bottom)" />
        </linearGradient>
      ))}
    </defs>
  );
}
