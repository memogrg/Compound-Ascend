/**
 * Por qué falló un escaneo de recibo, en un mensaje que dice ALGO.
 *
 * Antes las tres superficies colapsaban todo en "No pude procesar la imagen": el mismo texto para
 * una foto de 8 MB, para un timeout de la visión, para el límite de IA del plan agotado y para una
 * extracción que volvió vacía. Cuatro problemas con cuatro soluciones distintas —comprimir,
 * reintentar, esperar al mes que viene, sacar mejor la foto— y ninguna pista de cuál era.
 *
 * El servidor YA distingue: `AppError.userMessage` viaja en `error.message` con texto específico y
 * un código corto legible en una captura (IA-429, IA-503…), y el guard de presupuesto manda su
 * propio texto de plan. Así que la regla de acá es: **si el servidor habló, se muestra lo que
 * dijo**; el texto propio es solo para lo que el servidor nunca llegó a ver (la red se cayó, la
 * imagen ni siquiera entra) o para lo que solo el cliente sabe (la extracción vino vacía).
 *
 * Puro y sin React: se prueba entero sin montar un DOM ni un servidor.
 */

/** Causa ya normalizada. La arma el llamador con lo que tiene a mano. */
export type FalloEscaneo =
  /** Ni se intentó: el base64 pasa el tope de la ruta aun después de comprimir. */
  | { tipo: "imagen-grande"; bytes: number }
  /** El cliente cortó la espera (AbortError) antes que el servidor contestara. */
  | { tipo: "timeout" }
  /** fetch rechazó sin respuesta: sin conexión, DNS, CORS. */
  | { tipo: "red" }
  /** Hubo respuesta HTTP no-2xx. `mensaje` es el `error.message` del servidor, si vino. */
  | { tipo: "servidor"; status: number; code?: string; mensaje?: string }
  /** 2xx, pero el modelo no sacó ni monto ni comercio ni fecha. */
  | { tipo: "vacio" };

/** MB con un decimal y coma, como el resto de la app. */
function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Mensaje por status cuando el servidor NO mandó uno propio (proxy caído, 413 del edge, HTML de
 * error). Con `error.message` presente esto no se usa: el del servidor siempre es más preciso.
 */
function porStatus(status: number): string {
  if (status === 401) return "Hay que iniciar sesión de nuevo para escanear recibos.";
  if (status === 403) return "El escaneo no está permitido desde aquí.";
  if (status === 413) return "La foto es demasiado pesada para subirla.";
  if (status === 422) return "La imagen no es válida o es demasiado grande.";
  if (status === 429)
    return "Demasiados escaneos seguidos, o se acabó el límite de IA del plan. Hay que esperar un momento.";
  if (status === 502 || status === 503)
    return "La IA no respondió a tiempo. Vale la pena intentarlo de nuevo.";
  if (status >= 500) return `El servidor falló al escanear el recibo. (HTTP ${status})`;
  return `No se pudo escanear el recibo. (HTTP ${status})`;
}

/** El texto que ve el usuario. */
export function mensajeFalloEscaneo(f: FalloEscaneo): string {
  switch (f.tipo) {
    case "imagen-grande":
      return `La foto pesa ${mb(f.bytes)} y no se pudo comprimir en este dispositivo: es demasiado para escanearla. Una foto sacada con la cámara de la app suele pesar mucho menos.`;
    case "timeout":
      return "El escaneo tardó demasiado y se canceló. Puede ser la conexión o una foto muy pesada.";
    case "red":
      return "No hubo conexión con el servidor durante el escaneo.";
    case "servidor":
      // El del servidor MANDA: ya trae el motivo real (IA-429, IA-503, límite del plan…).
      return f.mensaje?.trim() ? f.mensaje.trim() : porStatus(f.status);
    case "vacio":
      return "No pude leer los datos del recibo. Conviene revisar que la foto esté enfocada y que el tiquete entre completo — igual podés escribirlos abajo.";
  }
}

/**
 * Meta para el log, SIN la imagen. Es lo que hace falta para correlacionar con la línea del
 * servidor (`[gemini] non-2xx` / `[scan-receipt] fallo`) sin subir un solo píxel a ningún lado.
 */
export function metaFalloEscaneo(f: FalloEscaneo): Record<string, unknown> {
  switch (f.tipo) {
    case "imagen-grande":
      return { tipo: f.tipo, bytes: f.bytes };
    case "servidor":
      return { tipo: f.tipo, status: f.status, code: f.code };
    default:
      return { tipo: f.tipo };
  }
}

/** Cuerpo de error de la ruta (`toSafeResponse`), leído a la defensiva: puede no ser JSON. */
type CuerpoError = { error?: { code?: unknown; message?: unknown } } | null | undefined;

/** Respuesta no-2xx → causa. */
export function falloDeRespuesta(status: number, body: CuerpoError): FalloEscaneo {
  const e = body?.error;
  return {
    tipo: "servidor",
    status,
    ...(typeof e?.code === "string" ? { code: e.code } : {}),
    ...(typeof e?.message === "string" && e.message.trim() ? { mensaje: e.message } : {}),
  };
}

/** Excepción del fetch → causa. El AbortError del timeout se distingue de la red caída. */
export function falloDeExcepcion(err: unknown): FalloEscaneo {
  const abortado =
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError");
  return abortado ? { tipo: "timeout" } : { tipo: "red" };
}

/**
 * ¿El modelo no sacó NADA? Con los tres campos en null no hay recibo que confirmar, solo un
 * formulario vacío — y decirlo es más útil que abrir la tarjeta como si hubiera funcionado.
 * La moneda no cuenta: casi ningún tiquete la declara, y su ausencia es lo normal.
 */
export function extraccionVacia(e: {
  amount?: unknown;
  merchant?: unknown;
  date?: unknown;
  /** Se listan para dejar explícito que llegan y que NO cuentan para "vacío". */
  currency?: unknown;
  category?: unknown;
}): boolean {
  return e.amount == null && e.merchant == null && e.date == null;
}
