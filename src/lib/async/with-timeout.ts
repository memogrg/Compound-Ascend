/**
 * Corre una promesa con un tope de tiempo: si no resuelve en `ms`, devuelve `fallback` de
 * inmediato (la promesa original sigue en background pero se ignora). También cae a `fallback`
 * si la promesa RECHAZA. Puro y testeable (con timers falsos). Se usa para que un carril
 * determinista NUNCA se cuelgue esperando al LLM: si el modelo no responde rápido, seguimos.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (v: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    void promise.then(
      (v) => finish(v),
      () => finish(fallback),
    );
  });
}
