import type { VsMes } from "@/modules/dashboard";

import { mAmount } from "./tone";

/**
 * Chip "vs mes anterior" compartido por las fichas del Inicio. Dibuja flecha + color + valor
 * + verbo; NO decide semántica (el signo, el color por dominio y la etiqueta llegan ya
 * resueltos en `VsMes`). Degrada a `null` cuando no hay dato, para que la ficha no muestre
 * chip (mismo patrón que el resto del carrusel).
 */
const ARROW: Record<NonNullable<VsMes>["dir"], string> = { up: "↑", down: "↓", flat: "→" };

export function MVsMes({ vs, currency }: { vs: VsMes; currency: string }) {
  if (!vs) return null;
  const text =
    vs.format === "amount" ? mAmount(vs.value, currency, 7) : `${Math.round(vs.value * 100)}%`;
  const toneClass = vs.tone === "pos" ? "pos" : vs.tone === "neg" ? "neg" : "";
  return (
    <span className={`m-vsmes ${toneClass}`.trim()}>
      <span className="m-vsmes-arrow" aria-hidden>
        {ARROW[vs.dir]}
      </span>
      {text}
      <span className="m-vsmes-label">{vs.label}</span>
    </span>
  );
}
