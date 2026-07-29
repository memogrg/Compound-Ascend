/**
 * fetch con timeout del CLIENTE vía AbortController. Si la respuesta tarda más que `timeoutMs`,
 * aborta y el fetch rechaza con un AbortError (name === "AbortError") — el llamador lo distingue
 * para mostrar "se está tardando…" en vez de dejar un spinner eterno. Puro respecto del DOM: usa
 * fetch/AbortController/setTimeout globales (navegador y Node). Limpia el timer siempre.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** true si el error es una cancelación por timeout (para el mensaje "se está tardando…"). */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
