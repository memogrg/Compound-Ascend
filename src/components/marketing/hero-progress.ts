/**
 * PROGRESO DEL HERO PINEADO — 0 arriba del track, 1 al final.
 *
 * El hero es un track alto (280vh) con la escena `sticky` adentro: el scroll no mueve la escena,
 * la ATRAVIESA, y ese avance es lo que gira el teléfono, desvanece el copy y saca la leyenda de la
 * trasera. O sea: un mismo número maneja tres cosas en dos componentes distintos.
 *
 * Por eso vive acá y no dentro de uno de ellos. Si cada uno midiera por su cuenta habría dos
 * `getBoundingClientRect` por frame (layout dos veces) y, peor, podrían leer valores distintos en
 * el mismo frame y desincronizarse justo en el tramo donde el teléfono gira.
 *
 * La medición va en un rAF: el listener de scroll dispara mucho más seguido que lo que la pantalla
 * puede dibujar, y medir de más no cambia lo que se ve.
 */

type Listener = (progreso: number) => void;

/** El track lo marca la landing con este atributo; sin él el progreso queda en 0 y nada se rompe. */
export const HERO_TRACK_ATTR = "data-lp-hero-track";

const listeners = new Set<Listener>();
let progreso = 0;
let rafId = 0;
let escuchando = false;

function medir(): void {
  rafId = 0;
  const track = document.querySelector<HTMLElement>(`[${HERO_TRACK_ATTR}]`);
  if (!track) return;
  const r = track.getBoundingClientRect();
  const recorrido = r.height - window.innerHeight;
  // Track más corto que la ventana (reduced-motion lo despinea con height:auto): no hay recorrido
  // que medir y 0 es la respuesta correcta — el teléfono se queda en su ángulo inicial.
  const p = recorrido <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / recorrido));
  if (p === progreso) return;
  progreso = p;
  for (const fn of listeners) fn(p);
}

function alScrollear(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(medir);
}

/** El último progreso medido. Útil para el primer frame, antes de que llegue un scroll. */
export function heroProgress(): number {
  return progreso;
}

/**
 * Se suscribe al progreso. Devuelve la baja. El listener se llama UNA vez de entrada con el valor
 * actual, para que quien se monta tarde (el teléfono, que carga con `next/dynamic`) no se quede
 * dibujando el estado inicial hasta que el usuario mueva el scroll.
 */
export function subscribeHeroProgress(fn: Listener): () => void {
  listeners.add(fn);
  if (!escuchando) {
    escuchando = true;
    window.addEventListener("scroll", alScrollear, { passive: true });
    window.addEventListener("resize", alScrollear, { passive: true });
  }
  medir();
  fn(progreso);

  return () => {
    listeners.delete(fn);
    if (listeners.size > 0) return;
    escuchando = false;
    window.removeEventListener("scroll", alScrollear);
    window.removeEventListener("resize", alScrollear);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };
}
