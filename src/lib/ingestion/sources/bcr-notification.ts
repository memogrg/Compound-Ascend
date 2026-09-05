/**
 * Fuente de ingesta: avisos del Banco de Costa Rica (BCR), calibrada con correos
 * REALES (sep 2026). Dos plantillas:
 *
 *  1. «Transacciones en su tarjeta BCR: ****-****-****-5269» + tabla
 *     «Fecha | Autorización | No.Referencia | Monto | Moneda | Comercio | Estado»
 *     con una fila «03/09/2026 07:34:40 00704612 624613517122 19,800.00
 *     COLON COSTA RICA HOSPITAL CLINICA BIBLICA SAN JOSE CR Aprobada».
 *  2. «Informe de transferencia entre cuentas BCR»: Fecha, Documento, Cuenta origen
 *     (IBAN + nombre), Cuenta destino (IBAN + nombre), Monto debitado ₡137.400,00,
 *     Monto transferido $300,00, Motivo. OJO: «entre cuentas BCR» NO significa
 *     cuentas propias: es cualquier cuenta del BCR. Es propia solo si el nombre
 *     de origen y destino coinciden.
 *
 * PURO: solo texto. Si no parece BCR o no calza, devuelve [] y sigue la genérica.
 */
import type { IngestionSource, NotificationMeta, RawMovement } from "@/lib/ingestion/types";
import {
  deburr,
  findCardLast4,
  flatten,
  isDeclinedNotification,
  parseAmountLoose,
} from "@/lib/ingestion/sources/common";

const BANK = "BCR";

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

function dmyToIso(d: string, m: string, y: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function isBcr(text: string, meta?: NotificationMeta): boolean {
  const from = (meta?.from ?? "").toLowerCase();
  if (/@(?:[a-z0-9.-]+\.)?bancobcr\.com$|@(?:[a-z0-9.-]+\.)?bcr\.fi\.cr$/.test(from)) return true;
  return /\bBCR\b|banco de costa rica/i.test(`${meta?.subject ?? ""}\n${text}`);
}

/** PLANTILLA 1 — fila de la tabla de transacciones con tarjeta. */
function parseCardRow(text: string): RawMovement | null {
  const flat = deburr(flatten(text));
  if (!/tarjeta BCR/i.test(flat)) return null;
  const row = flat.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}(?::\d{2})?\s+(\d{4,})\s+(\d{6,})\s+([\d.,]+)\s+(COLON(?:ES)?|DOLAR(?:ES)?|USD|CRC)(?:\s+COSTA RICA|\s+ESTADOUNIDENSES?|\s+EEUU)?\s+(.+?)\s+(Aprobada|Rechazada|Declinada|Denegada|Anulada)\b/i,
  );
  if (!row) return null;
  const [, d, m, y, auth, ref, amountRaw, curRaw, merchantRaw, estado] = row;
  if (!/^aprobada$/i.test(estado!)) return null;
  const amount = parseAmountLoose(amountRaw!);
  if (amount === null || amount <= 0) return null;
  const currency = /^(DOLAR|USD)/i.test(curRaw!) ? "USD" : "CRC";
  const merchant = merchantRaw!.replace(/\s+/g, " ").trim();
  return base({
    kind: "gasto",
    amount,
    currency,
    occurredOn: dmyToIso(d!, m!, y!),
    merchant,
    description: merchant,
    confidence: 0.95,
    externalRef: ref ?? auth ?? null,
    cardLast4: findCardLast4(text),
    rawText: text,
  });
}

/** Nombre en mayúsculas que sigue a un IBAN ("CR33… QUESADA PANIAGUA ANDREA"). */
function nameAfterIban(flat: string, label: string): string | null {
  const m = flat.match(
    new RegExp(
      `${label}\\s*:?\\s*(CR\\d{20})\\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]+?)(?=\\s+(?:Cuenta|Monto|Motivo|Documento|Fecha)\\b|$)`,
      "i",
    ),
  );
  return m?.[2]?.trim() ?? null;
}

function moneyAfter(flat: string, label: string): { amount: number; currency: string } | null {
  const m = flat.match(
    new RegExp(`${label}\\s*:?\\s*(₡|¢|\\$|CRC|USD)?\\s*([\\d.,]+)\\s*(₡|¢|\\$|CRC|USD)?`, "i"),
  );
  if (!m) return null;
  const amount = parseAmountLoose(m[2]!);
  if (amount === null || amount <= 0) return null;
  const sym = (m[1] ?? m[3] ?? "₡").toUpperCase();
  return { amount, currency: sym === "$" || sym === "USD" ? "USD" : "CRC" };
}

/** PLANTILLA 2 — transferencia entre cuentas BCR (a terceros o propia). */
function parseTransfer(text: string): RawMovement | null {
  const flat = flatten(text);
  if (!/transferencia entre cuentas BCR/i.test(deburr(flat))) return null;

  const debitado = moneyAfter(flat, "Monto debitado");
  const transferido = moneyAfter(flat, "Monto transferido");
  const money = debitado ?? transferido;
  if (!money) return null;

  const origen = nameAfterIban(flat, "Cuenta origen");
  const destino = nameAfterIban(flat, "Cuenta destino");
  const motivo = flat
    .match(/Motivo\s*:?\s*(.+?)(?=\s*Para m[aá]s informaci[oó]n|\s*En caso de|$)/i)?.[1]
    ?.trim();
  const doc = flat.match(/Documento\s*:?\s*(\d{4,})/i)?.[1] ?? null;
  const date = flat.match(/Fecha\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);

  const propia = Boolean(origen && destino && deburr(origen) === deburr(destino));
  const party = destino ?? null;
  const m = base({
    kind: "gasto",
    amount: money.amount,
    currency: money.currency,
    occurredOn: date ? dmyToIso(date[1]!, date[2]!, date[3]!) : "",
    merchant: propia ? null : party,
    description: propia
      ? `[Entre cuentas propias] ${motivo ?? "Transferencia BCR"}`
      : motivo
        ? `${motivo}${party ? ` · ${party}` : ""}`
        : party
          ? `Transferencia a ${party}`
          : "Transferencia BCR",
    confidence: propia ? 0.5 : 0.9,
    externalRef: doc,
    rawText: text,
  });
  // Si debitó en colones para mandar dólares, la nota lo aclara.
  if (debitado && transferido && debitado.currency !== transferido.currency) {
    m.description = `${m.description} (${transferido.amount.toLocaleString("en-US")} ${transferido.currency} transferidos)`;
  }
  return m;
}

export const bcrNotificationSource: IngestionSource<string> = {
  kind: "bank_notification",
  parse(text: string, meta?: NotificationMeta): RawMovement[] {
    if (!text || !isBcr(text, meta)) return [];
    if (isDeclinedNotification(text)) return [];
    const m = parseCardRow(text) ?? parseTransfer(text);
    return m && m.amount > 0 ? [m] : [];
  },
};
