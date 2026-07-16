/**
 * Coordinación entre la intro animada (MobileIntro) y el candado (AppLockOverlay).
 *
 * En arranque en frío con app-lock activo, el biométrico NO debe dispararse hasta que la intro
 * termine. Secuencia deseada: splash nativo breve → intro animada a pantalla completa → candado
 * (Face ID/huella) → app. Ambos componentes comparten esta bandera en memoria (mismo módulo en
 * el bundle) + un evento para el "ya terminó".
 */
const INTRO_DONE_EVENT = "cartera:intro-done";

let active = false;

/** La intro empezó a reproducirse (bloquea el prompt biométrico hasta que termine). */
export function beginIntro(): void {
  active = true;
}

/** La intro terminó: libera y avisa a quien esté esperando (p. ej. el candado). */
export function endIntro(): void {
  active = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INTRO_DONE_EVENT));
  }
}

/** ¿La intro está reproduciéndose ahora mismo? */
export function isIntroActive(): boolean {
  return active;
}

/** Ejecuta `cb` cuando la intro termine (una sola vez). Devuelve un limpiador. */
export function onIntroDone(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(INTRO_DONE_EVENT, handler, { once: true });
  return () => window.removeEventListener(INTRO_DONE_EVENT, handler);
}
