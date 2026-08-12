import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Reloj virtual inyectable (para la simulación / gemelo digital).
 *
 * Los lectores server-side del instante "ahora" NO deben llamar `new Date()` directamente:
 * llaman `now()`. Cuando el simulador corre un día virtual, envuelve la ejecución en
 * `withSimClock(fecha, fn)` y — gracias a AsyncLocalStorage, que propaga a través de cada
 * `await` — todo `now()` anidado (por profundo que esté, sin hilar nada) ve esa fecha.
 *
 * En PRODUCCIÓN no hay store activo, así que `now()` devuelve `new Date()`: comportamiento
 * byte-idéntico. Es la FUENTE del instante lo que cambia, nunca la lógica de negocio.
 *
 * Server-only a propósito: `node:async_hooks` no existe en el browser. El núcleo puro del
 * tiempo (`user-time-core.ts`, que sí usa el cliente) NO importa este módulo — recibe el
 * instante por su parámetro `at`, que los wrappers server-side rellenan con `now()`.
 */
const store = new AsyncLocalStorage<{ now: Date }>();

/** Ejecuta `fn` con el reloj fijado en `at`. Anida y propaga a través de `await`. */
export function withSimClock<T>(at: Date, fn: () => T): T {
  return store.run({ now: at }, fn);
}

/** El instante actual: el del reloj virtual si hay uno activo, si no `new Date()`. */
export function now(): Date {
  const s = store.getStore();
  // Copia defensiva: el llamador no debe poder mutar la fecha virtual compartida.
  return s ? new Date(s.now.getTime()) : new Date();
}

/** `true` si hay un reloj virtual activo (útil para aserciones/depuración). */
export function isSimClockActive(): boolean {
  return store.getStore() !== undefined;
}
