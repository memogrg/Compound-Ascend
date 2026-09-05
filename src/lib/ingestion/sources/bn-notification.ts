/**
 * Fuente de ingesta: comprobantes del Banco Nacional (BN), calibrada con correos
 * REALES (may–jun 2026). Redacción:
 *
 *   «Por este medio le hacemos llegar el comprobante de Compra realizada en
 *    FERRETERIA EPA SA SAN JOSE CRI el 23 de Junio de 2026 a las 8:08 p.m.»
 *   Jun 23, 2026 - 8:08 p.m. / MASTERCARD ************2308 / NRO. AUT: 235452 /
 *   REF: 43695055 (puede ser alfanumérico: MDWK596UF) / TOTAL: CRC 27939,00
 *
 * El monto viene con coma decimal y sin separador de miles (70000,00; 441,60).
 * PURO: solo texto. Si no parece BN o no calza, devuelve [] y sigue la genérica.
 */
import type { IngestionSource, NotificationMeta, RawMovement } from "@/lib/ingestion/types";
import {
  deburr,
  findCardLast4,
  findDate,
  flatten,
  isDeclinedNotification,
  parseAmountLoose,
} from "@/lib/ingestion/sources/common";

const BANK = "BNCR";

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

function isBn(text: string, meta?: NotificationMeta): boolean {
  const from = (meta?.from ?? "").toLowerCase();
  if (/@(?:[a-z0-9.-]+\.)?bncr\.fi\.cr$/.test(from)) return true;
  return /banco nacional|\bBNCR\b|\bBN\b/i.test(`${meta?.subject ?? ""}\n${text}`);
}

/** Recorta el sufijo de plaza que BN pega al comercio ("… SAN JOSE CRI", "… HEREDIA CRI"). */
function cleanMerchant(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+(?:SAN JOSE|HEREDIA|ALAJUELA|CARTAGO|GUANACASTE|PUNTARENAS|LIMON)?\s*CRI?$/i, "")
    .trim();
}

function parseComprobante(text: string): RawMovement | null {
  const flat = flatten(text);
  const head = flat.match(
    /comprobante de\s+([A-Za-zÁ-ú ]{3,30}?)\s+realizad[ao]\s+en\s+(.+?)\s+el\s+(\d{1,2}\s+de\s+[A-Za-zñ]+\s+de\s+\d{4})/i,
  );
  if (!head) return null;
  const tipo = deburr(head[1]!).toLowerCase().trim();
  const merchant = cleanMerchant(head[2]!);
  const date = findDate(head[3]!) ?? "";

  const total = flat.match(/TOTAL\s*:?\s*(CRC|USD|₡|\$)\s*([\d.,]+)/i);
  if (!total) return null;
  const amount = parseAmountLoose(total[2]!);
  if (amount === null || amount <= 0) return null;
  const currency = /USD|\$/i.test(total[1]!) ? "USD" : "CRC";

  const ref = flat.match(/\bREF\.?\s*:?\s*([A-Z0-9]{5,})/i)?.[1] ?? null;
  const auth = flat.match(/NRO\.?\s*AUT\.?\s*:?\s*([A-Z0-9]{4,})/i)?.[1] ?? null;

  // "Compra" y "Retiro" son gastos; un "Depósito"/"Abono" sería ingreso (no visto aún: baja confianza).
  const ingreso = /deposito|abono|credito/.test(tipo);
  const known = /compra|retiro|pago/.test(tipo);

  return base({
    kind: ingreso ? "ingreso" : "gasto",
    amount,
    currency,
    occurredOn: date,
    merchant,
    description: merchant,
    confidence: known ? 0.95 : 0.75,
    externalRef: ref ?? auth,
    cardLast4: findCardLast4(text),
    rawText: text,
  });
}

export const bnNotificationSource: IngestionSource<string> = {
  kind: "bank_notification",
  parse(text: string, meta?: NotificationMeta): RawMovement[] {
    if (!text || !isBn(text, meta)) return [];
    if (isDeclinedNotification(text)) return [];
    const m = parseComprobante(text);
    return m && m.amount > 0 ? [m] : [];
  },
};
