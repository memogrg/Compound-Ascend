/**
 * Fuente de ingesta: notificaciones de BAC (reenviadas por WhatsApp o correo). El
 * mismo banco manda dos layouts: etiqueta y valor en la MISMA línea (WhatsApp) o en
 * líneas SEPARADAS (correo, p. ej. "Comercio:\nHELADOS MOYO"). `fieldAfterLabel`
 * tolera ambos. Parser PURO; no custodia credenciales: solo lee el texto.
 *
 * Plantillas: compra con tarjeta y SINPE (recibido/debitado). Fallback de baja
 * confianza como última red. Si no parece de BAC, devuelve [].
 */
import type { IngestionSource, RawMovement } from "@/lib/ingestion/types";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** "5,000.00" → 5000.00 (coma = miles, punto = decimal). */
function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

/** "Jun 27, 2026, 18:55" (mes inglés abreviado) → "2026-06-27". null si no calza. */
function parseSpanishMonthDate(text: string): string | null {
  const m = text.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[1]!.toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2]!.padStart(2, "0")}`;
}

/** "2/6/2026" (D/M/YYYY de Costa Rica) → "2026-06-02". null si no calza. */
function parseDMY(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/** "Dólares"/"Dolares" → USD; "Colones" → CRC. */
function mapCurrencyWord(w: string): string {
  return /d[oó]lares/i.test(w) ? "USD" : "CRC";
}

/** Quita tildes para que las anclas SINPE matcheen con o sin acento. */
function deburr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Primer valor tras una etiqueta. Soporta dos layouts:
 *  - inline: "Comercio: AUTO MERCADO …"  → lo que sigue al label en la misma línea.
 *  - líneas separadas: "Comercio:\nHELADOS MOYO" → primera línea no vacía siguiente.
 * Búsqueda case-insensitive del label como subcadena. null si no aparece.
 */
function fieldAfterLabel(text: string, label: string): string | null {
  const lines = text.split(/\r?\n/);
  const needle = label.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i]!.toLowerCase().indexOf(needle);
    if (idx < 0) continue;
    const inline = lines[i]!.slice(idx + label.length).trim();
    if (inline) return inline; // valor en la misma línea (WhatsApp)
    for (let j = i + 1; j < lines.length; j++) {
      const v = lines[j]!.trim();
      if (v) return v; // valor en la línea siguiente (correo)
    }
    return null;
  }
  return null;
}

/** Recorta el comercio en el primer separador fuerte (doble espacio o "Ciudad y país"). */
function cleanMerchant(s: string | null): string | null {
  if (!s) return null;
  const cut = s.split(/\s{2,}|ciudad y pa[ií]s\s*:/i)[0]!.trim();
  return cut || null;
}

/** Primeros dígitos de un campo (p. ej. "35689751  Tipo de Transacción…" → "35689751"). */
function leadingDigits(s: string | null): string | null {
  return s?.match(/\d+/)?.[0] ?? null;
}

/** Últimos 4 de la tarjeta: del enmascarado "************2062" o "MASTER ***2062". */
function cardLast4(text: string): string | null {
  return text.match(/\*{3,}\s*(\d{4})/)?.[1] ?? null;
}

const BANK = "BAC";

function base(over: Partial<RawMovement>): RawMovement {
  return {
    kind: "gasto",
    amount: 0,
    currency: "CRC",
    occurredOn: "",
    merchant: null,
    description: "",
    sourceKind: "whatsapp_notification",
    bankCode: BANK,
    confidence: 0,
    externalRef: null,
    cardLast4: null,
    rawText: null,
    ...over,
  };
}

/** Aplica la regla de "CAMBIO DE DIVISA": baja confianza y antepone aviso. */
function withDivisaRule(m: RawMovement, concept: string): RawMovement {
  if (/CAMBIO DE DIVISA/i.test(deburr(concept))) {
    return { ...m, confidence: 0.6, description: `[Cambio de divisa] ${m.description}` };
  }
  return m;
}

/** PLANTILLA 1 — Compra con tarjeta → gasto. */
function parseCardPurchase(text: string): RawMovement | null {
  const isCard =
    /Comercio\s*:/i.test(text) &&
    (/Tipo de Transacci[oó]n\s*:/i.test(text) || /le detallamos la transacci[oó]n/i.test(text));
  if (!isCard) return null;

  const montoField = fieldAfterLabel(text, "Monto:") ?? "";
  const money = montoField.match(/(CRC|USD)\s*([\d.,]+)/i);
  if (!money) return null;

  const merchant = cleanMerchant(fieldAfterLabel(text, "Comercio:"));
  const date = parseSpanishMonthDate(fieldAfterLabel(text, "Fecha:") ?? "");
  const ref =
    leadingDigits(fieldAfterLabel(text, "Referencia:")) ??
    leadingDigits(fieldAfterLabel(text, "Autorización:")) ??
    leadingDigits(fieldAfterLabel(text, "Autorizacion:"));
  const last4 = cardLast4(text);

  // Alta confianza si hay monto + (comercio o referencia); si no, queda al fallback.
  if (!merchant && !ref) return null;

  return base({
    kind: "gasto",
    amount: parseAmount(money[2]!),
    currency: money[1]!.toUpperCase(),
    occurredOn: date ?? "",
    merchant,
    description: merchant ?? "Compra BAC",
    confidence: 0.95,
    externalRef: ref,
    cardLast4: last4,
    rawText: text,
  });
}

/** PLANTILLA 2 — SINPE recibido → ingreso. */
function parseSinpeReceived(text: string): RawMovement | null {
  const flat = deburr(text);
  if (!/recibio una transferencia/i.test(flat)) return null;

  const money = flat.match(/por un monto de\s*([\d.,]+)\s*(Dolares|Colones)/i);
  if (!money) return null;

  const concept = text.match(/por concepto\s+(?:de\s+)?(.+?)\s*,\s*la cual/i)?.[1]?.trim() ?? "";
  const date = parseDMY(flat.match(/el dia\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? "");
  const ref = flat.match(/numero de referencia\s*(\d+)/i)?.[1] ?? null;

  const m = base({
    kind: "ingreso",
    amount: parseAmount(money[1]!),
    currency: mapCurrencyWord(money[2]!),
    occurredOn: date ?? "",
    merchant: concept || null,
    description: concept || "SINPE recibido",
    confidence: 0.9,
    externalRef: ref,
    rawText: text,
  });
  return withDivisaRule(m, concept);
}

/** PLANTILLA 3 — SINPE debitado → gasto. */
function parseSinpeDebited(text: string): RawMovement | null {
  const flat = deburr(text);
  if (!/debitando su cuenta/i.test(flat)) return null;

  const money = flat.match(/un monto de\s*([\d.,]+)\s*(Dolares|Colones)/i);
  if (!money) return null;

  const concept = text.match(/por concepto de\s+(.+?)(?:D[ií]a y hora|\.|$)/i)?.[1]?.trim() ?? "";
  const date = parseDMY(
    flat.match(/(?:ciclo del dia|Dia y hora)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? "",
  );
  const ref = flat.match(/numero de referencia\s*(\d+)/i)?.[1] ?? null;

  const m = base({
    kind: "gasto",
    amount: parseAmount(money[1]!),
    currency: mapCurrencyWord(money[2]!),
    occurredOn: date ?? "",
    merchant: concept || null,
    description: concept || "SINPE debitado",
    confidence: 0.9,
    externalRef: ref,
    rawText: text,
  });
  return withDivisaRule(m, concept);
}

/** Fallback: parece BAC pero no calza plantilla; hay monto+moneda → baja confianza. */
function parseFallback(text: string): RawMovement | null {
  if (!/BAC/i.test(text)) return null;
  const crcUsd = text.match(/(CRC|USD)\s*([\d.,]+)/i);
  const word = text.match(/([\d.,]+)\s*(D[oó]lares|Colones)/i);
  if (!crcUsd && !word) return null;

  const amount = crcUsd ? parseAmount(crcUsd[2]!) : parseAmount(word![1]!);
  const currency = crcUsd ? crcUsd[1]!.toUpperCase() : mapCurrencyWord(word![2]!);
  // Sin fecha parseable: hoy (la fuente no la trae); el usuario confirma/edita.
  const today = new Date().toISOString().slice(0, 10);

  return base({
    kind: "gasto",
    amount,
    currency,
    occurredOn: today,
    description: "Movimiento BAC (revisá los datos)",
    confidence: 0.5,
    cardLast4: cardLast4(text),
    rawText: text,
  });
}

export const bacNotificationSource: IngestionSource<string> = {
  kind: "whatsapp_notification",
  parse(text: string): RawMovement[] {
    if (!text) return [];
    const m =
      parseCardPurchase(text) ??
      parseSinpeReceived(text) ??
      parseSinpeDebited(text) ??
      parseFallback(text);
    // Solo proponemos si pudimos extraer un monto > 0.
    return m && m.amount > 0 ? [m] : [];
  },
};
