/**
 * Fuente de ingesta: alertas de Davivienda / DAVIbank Costa Rica, calibrada con
 * correos REALES (Alertas@davibank.cr, asunto «Alerta Transacción Tarjeta de
 * Crédito Titular», mar–jun 2026). Es prosa en una sola oración:
 *
 *   «DAVIbank le notifica que la transacción realizada en CASTILLO COUNTRY CLUB
 *    HEREDIA Costa Rica, el día 25/06/2026 a las 10:49 PM con su tarjeta de
 *    crédito titular MC terminada en 9938 con número de autorización 496613 y
 *    referencia 617622814875 por CRC 20,550.00, fue aprobada.»
 *
 * PURO: solo texto. Si no parece Davivienda o no calza, devuelve [].
 */
import type { IngestionSource, NotificationMeta, RawMovement } from "@/lib/ingestion/types";
import { deburr, flatten, parseAmountLoose } from "@/lib/ingestion/sources/common";

const BANK = "DAVIVIENDA";

function base(over: Partial<RawMovement>): RawMovement {
  return {
    kind: "gasto",
    amount: 0,
    currency: "CRC",
    occurredOn: "",
    merchant: null,
    description: "",
    sourceKind: "bank_notification",
    bankCode: BANK,
    confidence: 0,
    externalRef: null,
    cardLast4: null,
    rawText: null,
    ...over,
  };
}

function isDavivienda(text: string, meta?: NotificationMeta): boolean {
  const from = (meta?.from ?? "").toLowerCase();
  if (/@(?:[a-z0-9.-]+\.)?(?:davibank\.cr|davivienda\.cr|davivienda\.com)$/.test(from)) return true;
  return /davibank|davivienda/i.test(`${meta?.subject ?? ""}\n${text}`);
}

/** "DLC*UBER EATS San Jose Costa Rica" → "DLC*UBER EATS"; "… HEREDIA Costa Rica" → "… HEREDIA". */
function cleanMerchant(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+(?:San Jose\s+)?Costa Rica$/i, "")
    .trim();
}

function parseAlerta(text: string): RawMovement | null {
  const flat = flatten(text);
  const m = flat.match(
    /transacci[oó]n realizada en\s+(.+?),?\s+el d[ií]a\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (!m) return null;
  const merchant = cleanMerchant(m[1]!);
  const occurredOn = `${m[4]}-${m[3]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;

  const money = flat.match(/\bpor\s+(CRC|USD)\s*([\d.,]*\d)/i);
  if (!money) return null;
  const amount = parseAmountLoose(money[2]!);
  if (amount === null || amount <= 0) return null;

  const estado = deburr(flat).match(/,?\s*fue\s+(aprobada|rechazada|declinada|denegada)/i)?.[1];
  if (estado && !/aprobada/i.test(estado)) return null;

  const ref = flat.match(/referencia\s+([A-Z0-9]{5,})/i)?.[1] ?? null;
  const auth = flat.match(/autorizaci[oó]n\s+([A-Z0-9]{4,})/i)?.[1] ?? null;
  const last4 = flat.match(/terminada en\s+(\d{4})/i)?.[1] ?? null;

  return base({
    kind: "gasto",
    amount,
    currency: money[1]!.toUpperCase(),
    occurredOn,
    merchant,
    description: merchant,
    confidence: 0.95,
    externalRef: ref ?? auth,
    cardLast4: last4,
    rawText: text,
  });
}

export const daviviendaNotificationSource: IngestionSource<string> = {
  kind: "bank_notification",
  parse(text: string, meta?: NotificationMeta): RawMovement[] {
    if (!text || !isDavivienda(text, meta)) return [];
    const m = parseAlerta(text);
    return m && m.amount > 0 ? [m] : [];
  },
};
