"use client";

import { useId } from "react";

/**
 * Halo del punto activo: un desenfoque del color de la serie por debajo del punto.
 *
 * Se aplica SOLO a la serie activa. Con halo en todas, el efecto deja de señalar nada y el
 * gráfico se ve sucio — el glow es un puntero, no un acabado.
 *
 * Id con `useId()` por lo mismo que los degradados: dos gráficos en la misma página.
 */
export function useGlowId(): string {
  return `cf-glow-${useId()}`;
}

export function GlowFilter({ id }: { id: string }) {
  return (
    <defs>
      {/* `userSpaceOnUse` y una caja generosa: con la caja por defecto (-10 %/120 %) el
          desenfoque se recorta y el halo sale cuadrado en los bordes del gráfico. */}
      <filter id={id} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="3" result="difuso" />
        <feFlood floodColor="var(--chart-glow)" result="tinte" />
        <feComposite in="tinte" in2="difuso" operator="in" result="halo" />
        <feMerge>
          <feMergeNode in="halo" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
