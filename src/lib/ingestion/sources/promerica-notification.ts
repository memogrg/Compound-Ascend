/**
 * Fuente de ingesta: avisos de Banco Promerica, calibrada con correos REALES
 * (jun 2026). Dos plantillas:
 *
 *  1. Compra («¡Tu transacción fue realizada con éxito!»): etiquetas SIN dos
 *     puntos — Comercio JERUSALEM COSTA RICA HEREDIA CR / Tipo de Comercio
 *     DEPARTMENT STORES / Ciudad/País COSTA RICA / Fecha/hora 22 jun 2026 / 16:15 /
 *     Número de tarjeta ****-****-****-6728 / Número de autorización 825861 /
 *     Número de referencia 4244012689 / Monto CRC: 16,915.00.
 *  2. Pago de tarjeta («El pago de la tarjeta de crédito propia por un monto de
 *     97,809.27 CRC se realizó con éxito.»): Referencia, Número de tarjeta
 *     4815 **** **** 6728, Cuenta origen, Fecha/Hora 24/06/2026 10:42:44 AM.
 *     Es un traslado a la propia tarjeta: se marca y queda con confianza baja.
 *
 * PURO: solo texto. Si no parece Promerica o no calza, devuelve [].
 */
import type { IngestionSource, NotificationMeta, RawMovement } from "@/lib/ingestion/types";
import {
  deburr,
  findDate,
  flatten,
  isDeclinedNotification,
  parseAmountLoose,
} from "@/lib/ingestion/sources/common";

const BANK = "PROMERICA";

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

function isPromerica(text: string, meta?: NotificationMeta): boolean {
  const from = (meta?.from ?? "").toLowerCase();
  if (/@(?:[a-z0-9.-]+\.)?(?:promerica\.fi\.cr|bancopromerica\.com|promerica\.com)$/.test(from)) {
    return true;
  }
  if (/promerica/i.test(`${meta?.subject ?? ""}\n${text}`)) return true;
  // El logo es una imagen: en el correo de compra la marca NO aparece como texto. Se
  // reconoce por la estructura, que es única de Promerica.
  const flat = deburr(flatten(text));
  return /tu transaccion fue realizada con exito/i.test(flat) && /tipo de comercio/i.test(flat);
}

/** Valor entre una etiqueta (con o sin dos puntos) y la siguiente. `nextLabels` ya son regex. */
function between(flat: string, label: string, nextLabels: string[]): string | null {
  const stop = nextLabels.join("|");
  const re = new RegExp(`${label}\\s*:?\\s*(.+?)\\s*(?=(?:${stop})\\b|$)`, "i");
  return flat.match(re)?.[1]?.trim() ?? null;
}

const LABELS = [
  "Comercio",
  "Tipo de Comercio",
  "Ciudad/Pa[ií]s",
  "Fecha/hora",
  "N[uú]mero de tarjeta",
  "N[uú]mero de autorizaci[oó]n",
  "N[uú]mero de referencia",
  "Monto",
  "Viv[ií] experiencias",
];

function parseCompra(text: string): RawMovement | null {
  const flat = flatten(text);
  if (!/Comercio\b/i.test(flat) || !/Monto\b/i.test(flat)) return null;
  const merchantRaw = between(flat, "Comercio", LABELS.slice(1));
  const money = flat.match(/Monto\s*:?\s*(CRC|USD)\s*:?\s*([\d.,]+)/i);
  if (!merchantRaw || !money) return null;
  const amount = parseAmountLoose(money[2]!);
  if (amount === null || amount <= 0) return null;

  const merchant = merchantRaw
    .replace(/\s+/g, " ")
    .replace(/\s+CR$/i, "")
    .trim();
  const fecha = between(flat, "Fecha/hora", LABELS.slice(4));
  const ref = flat.match(/N[uú]mero de referencia\s*:?\s*(\d{5,})/i)?.[1] ?? null;
  const auth = flat.match(/N[uú]mero de autorizaci[oó]n\s*:?\s*(\d{4,})/i)?.[1] ?? null;
  const last4 = flat.match(/N[uú]mero de tarjeta\s*:?\s*[\d*\-\s]*?(\d{4})\b/i)?.[1] ?? null;

  return base({
    kind: "gasto",
    amount,
    currency: money[1]!.toUpperCase(),
    occurredOn: (fecha && findDate(fecha)) || "",
    merchant,
    description: merchant,
    confidence: 0.95,
    externalRef: ref ?? auth,
    cardLast4: last4,
    rawText: text,
  });
}

function parsePagoTarjeta(text: string): RawMovement | null {
  const flat = flatten(text);
  const m = deburr(flat).match(
    /pago de la tarjeta de credito\s*(propia|de terceros?)?\s*por un monto de\s+([\d.,]+)\s*(CRC|USD)\s+se realizo con exito/i,
  );
  if (!m) return null;
  const amount = parseAmountLoose(m[2]!);
  if (amount === null || amount <= 0) return null;
  const propia = !m[1] || /propia/i.test(m[1]);
  const ref = flat.match(/Referencia\s*:?\s*(\d{5,})/i)?.[1] ?? null;
  const last4 = flat.match(/N[uú]mero de tarjeta\s*:?\s*\d{4}[\s*]+(\d{4})\b/i)?.[1] ?? null;
  const fecha = flat.match(/Fecha\/Hora\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];

  return base({
    kind: "gasto",
    amount,
    currency: m[3]!.toUpperCase(),
    occurredOn: (fecha && findDate(fecha)) || "",
    merchant: null,
    description: propia
      ? "[Pago de tarjeta] Tarjeta propia Promerica"
      : "[Pago de tarjeta] Tarjeta de terceros",
    confidence: 0.5,
    externalRef: ref,
    cardLast4: last4,
    rawText: text,
  });
}

export const promericaNotificationSource: IngestionSource<string> = {
  kind: "bank_notification",
  parse(text: string, meta?: NotificationMeta): RawMovement[] {
    if (!text || !isPromerica(text, meta)) return [];
    if (isDeclinedNotification(text)) return [];
    const m = parseCompra(text) ?? parsePagoTarjeta(text);
    return m && m.amount > 0 ? [m] : [];
  },
};
