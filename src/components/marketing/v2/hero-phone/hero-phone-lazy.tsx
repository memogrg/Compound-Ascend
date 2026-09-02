"use client";

import dynamic from "next/dynamic";

/**
 * Puente de cliente para el teléfono del hero.
 *
 * `next/dynamic` con `ssr: false` no se puede usar desde un Server Component en el App Router: hace
 * falta que la frontera de cliente esté declarada antes, y este archivo es esa frontera. `ssr: false`
 * no es una optimización sino un requisito: la escena toca `document`, `window` y WebGL al montarse.
 *
 * Sin `loading`: el hueco ya lo reserva la vitrina, que además trae dibujada la tarjeta estática de
 * respaldo. Meter un placeholder acá solo agregaría un salto de layout.
 */
const HeroPhone = dynamic(() => import("./hero-phone"), { ssr: false });

export function HeroPhoneLazy() {
  return <HeroPhone />;
}
