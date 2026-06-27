/**
 * Fuente de ingesta: notificaciones de BAC reenviadas por WhatsApp. Parser PURO
 * sobre anclas de texto estables (usa búsqueda, no full-match) para tolerar
 * cabeceras de reenvío ("Forwarded message", "From:", etc.). No custodia
 * credenciales; solo lee el texto que el usuario reenvía.
 *
 * Tres plantillas: compra con tarjeta, SINPE recibido y SINPE debitado. Si parece
 * de BAC pero no calza ninguna, un fallback de baja confianza para que el usuario
 * revise. Si no parece de BAC, devuelve [].
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

/** "Jun 11, 2026" (mes inglés abreviado) → "2026-06-11". null si no calza. */
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
    rawText: null,
    ...over,
  };
}

/** Aplica la regla de "CAMBIO DE DIVISA": baja confianza y antepone aviso. */
function withDivisaRule(m: RawMovement, concept: string): RawMovement {
  if (/CAMBIO DE DIVISA/i.test(concept)) {
    return { ...m, confidence: 0.6, description: `[Cambio de divisa] ${m.description}` };
  }
  return m;
}

/** PLANTILLA 1 — Compra con tarjeta → gasto. */
function parseCardPurchase(text: string): RawMovement | null {
  const isCard =
    /Comercio:/i.test(text) &&
    (/Tipo de Transacci[oó]n:/i.test(text) || /le detallamos la transacci[oó]n/i.test(text));
  if (!isCard) return null;

  const money = text.match(/Monto:\s*(CRC|USD)\s*([\d.,]+)/i);
  if (!money) return null;

  const merchantMatch = text.match(/Comercio:\s*(.+?)(?:\s{2,}|Ciudad y pa[ií]s:|[\r\n]|$)/i);
  const merchant = merchantMatch ? merchantMatch[1]!.trim() : null;

  const date = parseSpanishMonthDate((text.match(/Fecha:\s*(.+)/i)?.[1] ?? "").slice(0, 40));
  const ref =
    text.match(/Referencia:\s*(\d+)/i)?.[1] ?? text.match(/Autorizaci[oó]n:\s*(\d+)/i)?.[1] ?? null;

  return base({
    kind: "gasto",
    amount: parseAmount(money[2]!),
    currency: money[1]!.toUpperCase(),
    occurredOn: date ?? "",
    merchant,
    description: merchant ?? "Compra BAC",
    confidence: 0.95,
    externalRef: ref,
    rawText: text,
  });
}

/** PLANTILLA 2 — SINPE recibido → ingreso. */
function parseSinpeReceived(text: string): RawMovement | null {
  if (!/recibi[oó] una transferencia SINPE/i.test(text)) return null;

  const money = text.match(/por un monto de\s*([\d.,]+)\s*(D[oó]lares|Colones)/i);
  if (!money) return null;

  const concept = text.match(/por concepto\s+(?:de\s+)?(.+?)\s*,\s*la cual/i)?.[1]?.trim() ?? "";
  const date = parseDMY(text.match(/el d[ií]a\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? "");
  const ref = text.match(/n[uú]mero de referencia\s*(\d+)/i)?.[1] ?? null;

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
  if (!/debitando su cuenta/i.test(text)) return null;

  const money = text.match(/un monto de\s*([\d.,]+)\s*(D[oó]lares|Colones)/i);
  if (!money) return null;

  const concept =
    text.match(/por concepto de\s+(.+?)(?:D[ií]a y hora|\.|$)/i)?.[1]?.trim() ?? "";
  const date = parseDMY(
    text.match(/(?:ciclo del d[ií]a|D[ií]a y hora)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? "",
  );
  const ref = text.match(/n[uú]mero de referencia\s*(\d+)/i)?.[1] ?? null;

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
