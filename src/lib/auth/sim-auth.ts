import "server-only";

/**
 * AuthContext AMBIENTE (AsyncLocalStorage) — el análogo de `withSimClock` para la auth.
 * Utilidad de TEST ÚNICAMENTE: permite que un arnés headless (sin request scope de Next)
 * corra código que resuelve la sesión por cookie, resolviéndola al ctx inyectado.
 *
 * PRECEDENCIA (garantizada en `createSupabaseServerClient`, el único sitio que llama a
 * `cookies()`):
 *   1. ctx explícito por argumento (resolveAuth(ctx)) — gana siempre.
 *   2. Sesión por COOKIE (request scope real) — gana sobre el ALS.
 *   3. Este ctx ambiente — SOLO cuando NO hay request scope (headless/test).
 * En producción SIEMPRE hay request scope → el ALS se ignora → comportamiento byte a byte.
 * Además `withSimAuth` lanza si NODE_ENV === "production": no es alcanzable desde prod.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "@/lib/auth/auth-context";

const store = new AsyncLocalStorage<AuthContext>();

/**
 * TEST-ONLY. Corre `fn` con `ctx` como AuthContext ambiente (último recurso de la
 * resolución de auth). Prohibido en producción.
 */
export function withSimAuth<T>(ctx: AuthContext, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("withSimAuth es solo para tests; no debe usarse en producción.");
  }
  return store.run(ctx, fn);
}

/** El AuthContext ambiente si hay uno activo (solo tests); si no, undefined. */
export function getSimAuthContext(): AuthContext | undefined {
  return store.getStore();
}
