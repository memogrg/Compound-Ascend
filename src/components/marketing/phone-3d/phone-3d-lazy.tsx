"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida del teléfono 3D.
 *
 * Existe como componente aparte porque `next/dynamic` con `ssr: false` NO se puede usar desde un
 * Server Component en el App Router — hace falta que la frontera de cliente esté declarada antes.
 * La landing es un Server Component, así que este archivo es el puente.
 *
 * `ssr: false` es obligatorio y no una optimización: la escena toca `document`, `window` y WebGL en
 * el montaje, y nada de eso existe al renderizar en el servidor.
 *
 * Sin `loading`: el hueco ya lo reserva el contenedor de la escena con su sombra de piso, así que
 * meter un placeholder acá solo agregaría un salto de layout cuando el canvas lo reemplace.
 */
const Phone3D = dynamic(() => import("@/components/marketing/phone-3d/phone-3d"), { ssr: false });

export function Phone3DLazy() {
  return <Phone3D />;
}
