/**
 * Borrador EDITABLE de un recibo escaneado — la última defensa antes de escribir.
 *
 * Puro y sin React (mismo criterio que `batch-rows`, del que reusa el parseo de monto y la
 * validación de fecha): la tarjeta solo pinta lo que estas funciones deciden, así que las reglas
 * se prueban sin montar un DOM.
 *
 * POR QUÉ EXISTE. El OCR de un recibo se equivoca de tres formas conocidas y ninguna se notaba:
 *
 *  1. MONEDA. `extractReceipt` devuelve `currency: null` cuando el recibo no la declara —que es lo
 *     normal en un tiquete de súper, donde el total sale como "4.100" a secas—. Los dos llamadores
 *     caían a la moneda PRINCIPAL del usuario en silencio, así que a alguien con la principal en
 *     USD un tiquete de ₡4.100 le quedaba registrado como $4.100: el mismo número con un valor 500
 *     veces mayor. Acá la falta de moneda deja de ser un default invisible y pasa a ser un estado
 *     explícito (`origen`) que la tarjeta muestra y hace confirmar.
 *
 *  2. FECHA. Se aceptaba tal cual la que dijera el modelo. Una lectura como 2024-08-26 en un
 *     escaneo de hoy registraba el gasto dos años atrás, en un mes que el usuario nunca abre, y el
 *     "✓ registrado" no daba ninguna pista.
 *
 *  3. MONTO Y COMERCIO. Sin campos editables, el único arreglo era registrar mal y corregir
 *     después, transacción por transacción.
 *
 * Lo que sale de acá es EXACTAMENTE lo que se registra: `aPayloadRecibo` toma los valores
 * EDITADOS y el extractor no vuelve a intervenir.
 */
import { fechaValida, parsearMonto } from "@/lib/ai/batch-rows";
import { formatMoney, currencySymbol } from "@/lib/format";

/** Lo que devuelve `extractReceipt` (los campos que llegan al borrador). */
export type ReceiptExtract = {
  amount: number | null;
  date: string | null;
  merchant: string | null;
  currency: string | null;
};

// ---------------------------------------------------------------------------
// Moneda
// ---------------------------------------------------------------------------

/**
 * De dónde salió la moneda del borrador:
 *  - `recibo`    — la declaró el recibo (₡ o $ impresos). No hay nada que confirmar.
 *  - `pais`      — se dedujo de la zona horaria del perfil. Hay que confirmarla.
 *  - `principal` — no se pudo deducir; se usó la principal del usuario. Hay que confirmarla.
 */
export type CurrencyOrigin = "recibo" | "pais" | "principal";

/**
 * Zona IANA del perfil → moneda de curso legal del país.
 *
 * Es el default SENSATO cuando el recibo no declara moneda: alguien en Costa Rica que mira sus
 * totales en dólares sigue pagando el súper en colones, así que la moneda de VISUALIZACIÓN —e
 * incluso la PRINCIPAL— es mal proxy de la del papel que tiene en la mano. La zona horaria sí lo
 * es, y ya viaja a las dos superficies (`user-time.ts`) sin pedir un dato nuevo al usuario.
 *
 * Solo mapea las zonas cuyos países usan una de las monedas soportadas; el resto cae a la
 * principal. Una zona que no está acá no es un bug: es un país cuya moneda no se puede capturar.
 */
const CURRENCY_BY_TZ: Record<string, string> = {
  "America/Costa_Rica": "CRC",
  // Estados Unidos y los países dolarizados de la región.
  "America/New_York": "USD",
  "America/Detroit": "USD",
  "America/Chicago": "USD",
  "America/Denver": "USD",
  "America/Phoenix": "USD",
  "America/Los_Angeles": "USD",
  "America/Anchorage": "USD",
  "Pacific/Honolulu": "USD",
  "America/Panama": "USD",
  "America/El_Salvador": "USD",
  "America/Guayaquil": "USD",
  "America/Puerto_Rico": "USD",
  // México.
  "America/Mexico_City": "MXN",
  "America/Monterrey": "MXN",
  "America/Merida": "MXN",
  "America/Cancun": "MXN",
  "America/Chihuahua": "MXN",
  "America/Hermosillo": "MXN",
  "America/Mazatlan": "MXN",
  "America/Tijuana": "MXN",
  // Colombia.
  "America/Bogota": "COP",
  // Zona euro.
  "Europe/Madrid": "EUR",
  "Atlantic/Canary": "EUR",
  "Europe/Lisbon": "EUR",
  "Europe/Paris": "EUR",
  "Europe/Berlin": "EUR",
  "Europe/Rome": "EUR",
  "Europe/Amsterdam": "EUR",
  "Europe/Brussels": "EUR",
  "Europe/Dublin": "EUR",
  "Europe/Vienna": "EUR",
  // Reino Unido.
  "Europe/London": "GBP",
};

/** Moneda del país de la zona horaria del perfil, o null si no se puede deducir. */
export function currencyForTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  return CURRENCY_BY_TZ[tz] ?? null;
}

/**
 * Moneda del borrador + de dónde salió. La detectada MANDA; si no hay, se propone la del país y
 * se marca como no confirmada. Nunca se adopta una moneda en silencio.
 */
export function resolveReceiptCurrency(opts: {
  detected: string | null | undefined;
  timezone: string | null | undefined;
  primaryCurrency: string;
}): { currency: string; origin: CurrencyOrigin } {
  if (opts.detected) return { currency: opts.detected, origin: "recibo" };
  const local = currencyForTimezone(opts.timezone);
  if (local) return { currency: local, origin: "pais" };
  return { currency: opts.primaryCurrency, origin: "principal" };
}

/** Etiqueta del chip con el que se confirma la moneda propuesta: «Sí, es ₡ (CRC)». */
export function etiquetaConfirmarMoneda(currency: string): string {
  const sym = currencySymbol(currency);
  return sym === currency ? `Sí, es ${currency}` : `Sí, es ${sym} (${currency})`;
}

// ---------------------------------------------------------------------------
// Fecha
// ---------------------------------------------------------------------------

/**
 * Estado de la fecha leída:
 *  - `ok`        — válida y del mes en curso.
 *  - `otro-mes`  — válida y plausible, pero de otro mes: se CONSERVA y se advierte (un recibo de
 *                  fin de mes escaneado el día 2 es legítimo; el de hace dos años casi nunca).
 *  - `faltante`  — el recibo no la traía.
 *  - `invalida`  — el modelo devolvió algo que no es una fecha real (2026-02-31 y similares).
 *  - `futura`    — posterior a hoy: un recibo no puede ser del futuro.
 *  - `absurda`   — tan vieja que es basura de OCR, no un recibo viejo.
 *
 * Los cuatro últimos NO se registran: el borrador cae a hoy y lo dice. `otro-mes` sí se conserva,
 * porque descartar una fecha correcta es tan malo como aceptar una incorrecta.
 */
export type DateFlag = "ok" | "otro-mes" | "faltante" | "invalida" | "futura" | "absurda";

/**
 * Corte de "esto ya no es un recibo viejo, es una lectura rota". Cinco años: por debajo puede
 * haber un recibo real (una garantía, un gasto que se está cargando tarde) y reemplazarlo por hoy
 * sería tirar un dato bueno; por encima solo hay ruido de OCR (años a dos dígitos leídos al revés,
 * números de factura tomados por fecha).
 */
const ANTIGUEDAD_ABSURDA_DIAS = 365 * 5;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function aUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Días de `a` a `b` (positivo si `b` es posterior). Ambas en YYYY-MM-DD válido. */
function diasEntre(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / 86_400_000);
}

/** ¿Las dos fechas caen en el mismo mes calendario? */
export function mismoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** «agosto 2024» — el mes de una fecha ISO, para decirle al usuario DÓNDE quedó el movimiento. */
export function mesLegible(iso: string): string {
  const mes = MESES[Number(iso.slice(5, 7)) - 1];
  return mes ? `${mes} ${iso.slice(0, 4)}` : iso;
}

/** «26 de agosto de 2024» — la fecha completa para el resumen de lo registrado. */
export function fechaLegible(iso: string): string {
  if (!fechaValida(iso)) return iso;
  const mes = MESES[Number(iso.slice(5, 7)) - 1];
  return `${Number(iso.slice(8, 10))} de ${mes} de ${iso.slice(0, 4)}`;
}

/**
 * Evalúa la fecha del OCR contra "hoy" (en la zona del PERFIL, que es la que resuelve
 * `user-time.ts`, no la del navegador). Devuelve la que debe quedar en el campo y por qué.
 */
export function evaluarFecha(
  raw: string | null | undefined,
  hoy: string,
): { date: string; flag: DateFlag } {
  if (!raw || !raw.trim()) return { date: hoy, flag: "faltante" };
  if (!fechaValida(raw)) return { date: hoy, flag: "invalida" };
  // Comparación lexicográfica: con YYYY-MM-DD ya validado equivale a la cronológica.
  if (raw > hoy) return { date: hoy, flag: "futura" };
  if (diasEntre(raw, hoy) > ANTIGUEDAD_ABSURDA_DIAS) return { date: hoy, flag: "absurda" };
  return { date: raw, flag: mismoMes(raw, hoy) ? "ok" : "otro-mes" };
}

/**
 * Aviso VISIBLE de la fecha que está en el campo ahora mismo. Se recalcula en cada render, así
 * que corregir la fecha apaga el aviso solo. `leida` es lo que dijo el OCR (para poder nombrarlo
 * cuando se descartó).
 */
export function avisoFecha(
  actual: string,
  hoy: string,
  origen: { flag: DateFlag; leida: string | null },
): { texto: string; tono: "aviso" | "error" } | null {
  const propia = evaluarFecha(actual, hoy);
  if (propia.flag === "invalida") return { texto: "Fecha inválida.", tono: "error" };
  if (propia.flag === "futura")
    return { texto: "La fecha es futura; un recibo no puede serlo.", tono: "error" };
  // El aviso de "no es de este mes" pisa al de origen: es el que importa antes de confirmar.
  if (propia.flag === "otro-mes" || propia.flag === "absurda")
    return { texto: `Esta fecha es de ${mesLegible(actual)} — ¿es correcta?`, tono: "aviso" };
  // Ya está en el mes en curso: solo queda contar que la del recibo se descartó, si se descartó.
  if (actual !== hoy) return null;
  if (origen.flag === "faltante")
    return { texto: "No detecté la fecha en el recibo; se usó la de hoy.", tono: "aviso" };
  if (origen.flag === "invalida" || origen.flag === "absurda")
    return {
      texto: `La fecha del recibo (${origen.leida ?? "?"}) no parece válida; se usó la de hoy.`,
      tono: "aviso",
    };
  if (origen.flag === "futura")
    return {
      texto: `La fecha del recibo (${origen.leida ?? "?"}) es futura; se usó la de hoy.`,
      tono: "aviso",
    };
  return null;
}

// ---------------------------------------------------------------------------
// Borrador
// ---------------------------------------------------------------------------

/**
 * Recibo en edición. `amountText` es texto y no número a propósito (igual que en el alta en lote):
 * mientras se escribe, el campo pasa por estados que no son un número válido ("", "4.", "-").
 */
export type ReceiptDraft = {
  description: string;
  amountText: string;
  currency: string;
  currencyOrigin: CurrencyOrigin;
  occurredOn: string;
  /** Fecha tal como la leyó el OCR, aunque se haya descartado. */
  dateRead: string | null;
  dateFlag: DateFlag;
  categoryId: string | null;
};

const MAX_DESC = 160;

/** Formatea un número para el campo de texto sin notación científica ni ceros de más. */
function montoATexto(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100);
}

/**
 * Extracción del OCR → borrador editable. Es el ÚNICO lugar donde se deciden los defaults, así
 * que las dos superficies (panel web y chat móvil) no pueden divergir en cómo resuelven la moneda
 * o la fecha.
 */
export function draftFromExtract(
  extract: ReceiptExtract,
  opts: { hoy: string; primaryCurrency: string; timezone: string | null | undefined },
): ReceiptDraft {
  const { currency, origin } = resolveReceiptCurrency({
    detected: extract.currency,
    timezone: opts.timezone,
    primaryCurrency: opts.primaryCurrency,
  });
  const { date, flag } = evaluarFecha(extract.date, opts.hoy);
  return {
    description: extract.merchant?.trim() ?? "",
    amountText: montoATexto(extract.amount),
    currency,
    currencyOrigin: origin,
    occurredOn: date,
    dateRead: extract.date ?? null,
    dateFlag: flag,
    categoryId: null,
  };
}

export type ReceiptErrors = { comercio?: string; monto?: string; fecha?: string };

/**
 * Errores del borrador. Espeja `transactionInputSchema`, que es lo que el servidor va a exigir
 * igual: mejor decirlo en la tarjeta que fallar después de tocar "Confirmar". El SOBRE no es
 * obligatorio (sin él el pipeline central auto-categoriza o cae a "Por clasificar").
 */
export function validarRecibo(d: ReceiptDraft, hoy: string): ReceiptErrors {
  const e: ReceiptErrors = {};

  const desc = d.description.trim();
  if (!desc) e.comercio = "Falta el comercio";
  else if (desc.length > MAX_DESC) e.comercio = `Máximo ${MAX_DESC} caracteres`;

  const monto = parsearMonto(d.amountText);
  if (monto === null) e.monto = "Falta el monto";
  else if (monto <= 0) e.monto = "El monto tiene que ser mayor que cero";

  if (!d.occurredOn.trim()) e.fecha = "Falta la fecha";
  else if (!fechaValida(d.occurredOn)) e.fecha = "Fecha inválida";
  else if (d.occurredOn > hoy) e.fecha = "La fecha no puede ser futura";

  return e;
}

/** ¿Falta que el usuario confirme la moneda? Solo si NO la declaró el recibo. */
export function necesitaConfirmarMoneda(d: ReceiptDraft): boolean {
  return d.currencyOrigin !== "recibo";
}

/**
 * Borrador → payload de `confirmTransactionAction`. Toma los valores EDITADOS, no los del OCR:
 * lo que el usuario ve en la tarjeta es lo que se registra.
 */
export function aPayloadRecibo(d: ReceiptDraft): {
  kind: "gasto";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  source: "receipt";
} {
  return {
    kind: "gasto",
    description: d.description.trim(),
    amount: parsearMonto(d.amountText) ?? 0,
    currency: d.currency,
    occurredOn: d.occurredOn,
    categoryId: d.categoryId,
    source: "receipt",
  };
}

// ---------------------------------------------------------------------------
// Después de registrar
// ---------------------------------------------------------------------------

/**
 * Qué se registró, con todo lo que el usuario acaba de decidir. Un "✓ registrado" a secas no
 * permite notar que el OCR se equivocó; esto lo dice con monto, MONEDA, fecha y comercio.
 *
 * `periodo` solo aparece cuando el movimiento NO cae en el mes en curso: es el caso en el que el
 * usuario iría a buscarlo a sus movimientos y no lo encontraría.
 */
export function resumenRegistro(
  d: { amount: number; currency: string; occurredOn: string; description: string },
  hoy: string,
): { titulo: string; periodo: string | null } {
  const titulo = `✓ Registrado: ${formatMoney(d.amount, d.currency)} · ${d.description} · ${fechaLegible(d.occurredOn)}`;
  const periodo = mismoMes(d.occurredOn, hoy)
    ? null
    : `Quedó en ${mesLegible(d.occurredOn)}, no en tu mes actual: no vas a verlo en los movimientos de este mes.`;
  return { titulo, periodo };
}
