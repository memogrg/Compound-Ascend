/**
 * Estabilidad de la suite (Fase 11): bloquea el fetch a RED EXTERNA en los tests unitarios.
 *
 * Varios tests que construyen el FinancialContext llaman —vía context-engine— a coingecko / fx-rates /
 * economic-indicators (todos envueltos en try/catch o `.catch()` → degradan sin romper). Sin este guard,
 * bajo contención de red esos fetch REALES timeouteaban a 5 s y volvían la suite flaky (pasaban aislados,
 * fallaban en paralelo). Acá el fetch externo se rechaza RÁPIDO y determinista → el context-engine degrada
 * igual, sin salir a la red.
 *
 * Localhost se PERMITE (Supabase de prueba de los tests RLS). Un test que necesita simular una respuesta
 * usa `vi.stubGlobal("fetch", …)`, que sobrescribe este baseline durante su corrida y lo restaura después
 * (nunca vuelve al fetch real). Se registra en `vitest.config.ts` → `test.setupFiles`.
 */
const passthrough = globalThis.fetch;

const esLocal = (url: string): boolean =>
  url.startsWith("/") || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(url);

globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (esLocal(url)) return passthrough(input, init);
  return Promise.reject(
    new Error(`[test] red externa bloqueada en unit test: ${url.slice(0, 80)}`),
  );
}) as typeof fetch;
