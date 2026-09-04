/**
 * Fuente de ingesta GENÉRICA para notificaciones de bancos y cooperativas de
 * Costa Rica que todavía no tienen plantilla propia (BNCR, BCR, Popular,
 * Scotiabank, Promerica, Davivienda, Lafise, Coopenae…). BAC tiene la suya y va
 * primero en el registro; esta entra solo si aquella no reconoce el correo.
 *
 * Cómo trabaja: identifica el banco (dominio del remitente o marca en el texto),
 * descarta rechazos, saca monto+moneda, clasifica el tipo de aviso (compra,
 * SINPE, retiro en cajero, reverso, pago de tarjeta, entre cuentas propias) y
 * rescata comercio/contraparte, fecha, referencia y último-4 con anclas
 * comunes. La confianza NUNCA pasa de 0.85: la propuesta siempre pasa por
 * «Por revisar», donde el usuario corrige antes de confirmar. Si no hay banco
 * o no hay monto, devuelve [] y el poller deja el rastro en ingest_notices
 * (esa es la cola para escribir la plantilla exacta con muestras reales).
 *
 * PURO: solo texto de entrada.
 */
import type { IngestionSource, RawMovement } from "@/lib/ingestion/types";
import {
  type CrBank,
  type NotificationMeta,
  deburr,
  detectBank,
  fieldAfterLabel,
  findCardLast4,
  findDate,
  findMoney,
  findReference,
  flatten,
  isDeclinedNotification,
} from "@/lib/ingestion/sources/common";

type Aviso =
  | "reverso"
  | "cuentas_propias"
  | "pago_tarjeta"
  | "cajero"
  | "sinpe_movil"
  | "sinpe"
  | "compra"
  | "ingreso"
  | "gasto";

const RE_REVERSO = /\b(revers(?:o|i[oó]n)|anulaci[oó]n|devoluci[oó]n|reintegro|reembolso)\b/i;
const RE_PROPIAS =
  /\b(cuentas? propias?|entre (?:sus )?cuentas|transferencia propia|mismo titular)\b/i;
const RE_PAGO_TARJETA =
  /\b(pago (?:de |a )?(?:su |la )?tarjeta|abono a (?:su |la )?tarjeta|pago tarjeta)\b/i;
const RE_CAJERO = /\b(retiro (?:en |de )?(?:cajero|efectivo|atm)|cajero autom[aá]tico|ATM)\b/i;
const RE_SINPE_MOVIL = /\bsinpe\s*m[oó]vil\b/i;
const RE_SINPE = /\bsinpe\b|\btransferencia\b|\btef\b/i;
const RE_COMPRA =
  /\b(compra|consumo|transacci[oó]n con (?:su )?tarjeta|cargo (?:a|en) (?:su )?tarjeta)\b/i;
const RE_INGRESO =
  /\b(recibi[oó]|recibid[ao]|dep[oó]sito|abon[oó]|abonad[ao]|acredit[oó]|acreditad[ao]|cr[eé]dito (?:a|en) (?:su|la) cuenta|le (?:ha )?transfiri[oó]|transferencia recibida|ingres[oó]|a su favor|entrante)\b/i;
const RE_GASTO =
  /\b(compra|d[eé]bito|debit[oó]|debitad[ao]|retiro|pag[oó]|cargo|consumo|transferencia (?:enviada|realizada|saliente)|envi[oó]|enviad[ao]|rebaj[oó]|deducci[oó]n|dispuso|saliente)\b/i;

/** Etiquetas de contraparte/comercio, en orden de confianza. */
const MERCHANT_LABELS = [
  "Comercio",
  "Establecimiento",
  "Afiliado",
  "Lugar",
  "Nombre del comercio",
  "Descripción",
  "Descripcion",
  "Detalle",
  "Concepto",
  "Motivo",
  "Beneficiario",
  "Destinatario",
  "Destino",
  "Origen",
  "Remitente",
  "Ordenante",
  "De",
  "Para",
];
const STOP_LABELS = [
  "Monto",
  "Fecha",
  "Hora",
  "Referencia",
  "Autorización",
  "Autorizacion",
  "Tarjeta",
  "Cuenta",
  "Saldo",
  "Tipo",
  "Moneda",
  "Ciudad",
  "País",
  "Pais",
  "Estado",
  "Canal",
  "Comprobante",
  "Documento",
  "Detalle",
  "Concepto",
];

/** Dirección (ingreso/gasto) por la primera palabra clave que aparezca. */
function direction(flat: string): "ingreso" | "gasto" {
  const inIdx = flat.search(RE_INGRESO);
  const outIdx = flat.search(RE_GASTO);
  if (inIdx >= 0 && (outIdx < 0 || inIdx < outIdx)) return "ingreso";
  return "gasto";
}

function classify(flat: string): Aviso {
  if (RE_REVERSO.test(flat)) return "reverso";
  if (RE_PROPIAS.test(flat)) return "cuentas_propias";
  if (RE_PAGO_TARJETA.test(flat)) return "pago_tarjeta";
  if (RE_CAJERO.test(flat)) return "cajero";
  if (RE_SINPE_MOVIL.test(flat)) return "sinpe_movil";
  if (RE_SINPE.test(flat)) return "sinpe";
  if (RE_COMPRA.test(flat)) return "compra";
  return direction(flat);
}

/** Cosas que un patrón "en X" / "de X" atrapa pero NO son contraparte. */
const NOISE_RE =
  /^(costa rica|san jos[eé]|colones|d[oó]lares|crc|usd|sinpe(?: m[oó]vil)?|iban|l[ií]nea|el d[ií]a|su cuenta|la cuenta|cuenta|tarjeta|cr[eé]dito|d[eé]bito|banco|internet|banking|m[oó]vil)$/i;

function isNoise(s: string): boolean {
  if (NOISE_RE.test(s.trim())) return true;
  return detectBank(s) !== null;
}

/** Limpia una contraparte: quita IBANs, teléfonos, tarjetas enmascaradas y puntuación sobrante. */
function cleanParty(s: string | null): string | null {
  if (!s) return null;
  let out = s
    .replace(/\bCR\d{2}[\dX*]{18,}\b/gi, "")
    .replace(/\b(?:\+?506[\s-]?)?\d{4}[\s-]?\d{4}\b/g, "")
    .replace(/[*]{3,}\d{0,4}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:.,;\-–]+|[\s:.,;\-–]+$/g, "")
    .trim();
  if (/^(la|su|una?)\s+cuenta\b/i.test(out)) return null;
  // Recorta si arrastró una oración ("… por un monto de …").
  out = out.split(/\s+por\s+(?:un\s+)?monto\b|\s+el\s+d[ií]a\b|\s+a\s+las\b/i)[0]!.trim();
  if (!out || out.length < 2 || out.length > 80 || isNoise(out)) return null;
  return out;
}

/** Comercio/contraparte por etiqueta; luego por patrones "en COMERCIO", "de NOMBRE", "a NOMBRE". */
function findParty(text: string, aviso: Aviso): string | null {
  for (const label of MERCHANT_LABELS) {
    const v = fieldAfterLabel(text, `${label}:`, STOP_LABELS);
    const cleaned = cleanParty(v);
    if (cleaned && !/^\d+$/.test(cleaned)) return cleaned;
  }
  const flat = flatten(text);
  // "en AUTO MERCADO SANTA ANA" / "en el comercio AUTO MERCADO"
  const en = flat.match(
    /\ben\s+(?:el\s+comercio\s+|el\s+establecimiento\s+)?([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 .&'\-]{2,50}?)(?=\s+(?:por|el|con|a las|el d[ií]a)\b|[,.]|$)/,
  );
  if (en && (aviso === "compra" || aviso === "gasto" || aviso === "cajero")) {
    const v = cleanParty(en[1]!);
    if (v) return v;
  }
  // SINPE: "de JUAN PEREZ MORA" (recibido) / "a MARIA SOLANO" (enviado)
  const party = flat.match(
    /\b(?:de|a|para|desde)\s+(?:la\s+cuenta\s+de\s+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ]+){1,4})\b/,
  );
  if (party) {
    const v = cleanParty(party[1]!);
    if (v) return v;
  }
  // Concepto en prosa: "por concepto de PAGO ALMUERZO"
  const concepto = flat.match(/por concepto(?: de)?\s+(.+?)(?=[,.]|\s+(?:el|la cual|d[ií]a)\b|$)/i);
  if (concepto) return cleanParty(concepto[1]!);
  return null;
}

/**
 * Asunto estilo "Notificación de transacción CINEPOLIS WEB 03-09-2026 - 08:04":
 * el comercio y la fecha vienen ahí aunque el cuerpo llegue vacío o en HTML raro.
 */
export function partyFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const s = flatten(subject);
  const m =
    s.match(
      /(?:notificaci[oó]n|alerta|aviso)\s+de\s+(?:transacci[oó]n|compra|movimiento)\s*:?\s+(.+?)\s+\d{1,2}[-/]\d{1,2}[-/]\d{4}/i,
    ) ?? s.match(/(?:compra|consumo|transacci[oó]n)\s+en\s+(.+?)(?:\s+por\b|\s*[-–]\s*|$)/i);
  return cleanParty(m?.[1] ?? null);
}

function base(bank: CrBank, over: Partial<RawMovement>): RawMovement {
  return {
    kind: "gasto",
    amount: 0,
    currency: "CRC",
    occurredOn: "",
    merchant: null,
    description: "",
    sourceKind: "bank_notification",
    bankCode: bank.code,
    confidence: 0,
    externalRef: null,
    cardLast4: null,
    rawText: null,
    ...over,
  };
}

const LABEL: Record<Aviso, string> = {
  reverso: "Reverso",
  cuentas_propias: "Entre cuentas propias",
  pago_tarjeta: "Pago de tarjeta",
  cajero: "Retiro en cajero",
  sinpe_movil: "SINPE Móvil",
  sinpe: "Transferencia",
  compra: "Compra",
  ingreso: "Ingreso",
  gasto: "Movimiento",
};

export function parseCrGeneric(text: string, meta?: NotificationMeta): RawMovement[] {
  if (!text && !meta?.subject) return [];
  const bank = detectBank(text, meta);
  if (!bank) return [];
  if (isDeclinedNotification(text)) return [];

  const money = findMoney(text) ?? findMoney(meta?.subject ?? "");
  if (!money) return [];

  const flat = deburr(flatten(text));
  const aviso = classify(flat);
  const party = findParty(text, aviso) ?? partyFromSubject(meta?.subject);
  const date = findDate(text) ?? findDate(meta?.subject ?? "") ?? "";
  const ref = findReference(text);
  const last4 = findCardLast4(text);

  let kind: "gasto" | "ingreso";
  let confidence: number;
  let prefix = "";
  switch (aviso) {
    case "reverso":
      kind = "ingreso";
      confidence = 0.6;
      prefix = "[Reverso] ";
      break;
    case "cuentas_propias":
      kind = direction(flat);
      confidence = 0.5;
      prefix = "[Entre cuentas propias] ";
      break;
    case "pago_tarjeta":
      kind = "gasto";
      confidence = 0.5;
      prefix = "[Pago de tarjeta] ";
      break;
    case "cajero":
      kind = "gasto";
      confidence = 0.8;
      break;
    case "sinpe_movil":
    case "sinpe":
      kind = direction(flat);
      confidence = 0.7;
      break;
    case "compra":
      kind = "gasto";
      confidence = 0.7;
      break;
    case "ingreso":
      kind = "ingreso";
      confidence = 0.6;
      break;
    default:
      kind = "gasto";
      confidence = 0.55;
  }
  if (party) confidence += 0.1;
  if (ref) confidence += 0.05;
  confidence = Math.min(Math.round(confidence * 100) / 100, 0.85);

  const label =
    aviso === "sinpe_movil" || aviso === "sinpe"
      ? `${LABEL[aviso]} ${kind === "ingreso" ? "recibida" : "enviada"}`
      : LABEL[aviso];
  const description = `${prefix}${party ?? `${label} · ${bank.name}`}`;

  return [
    base(bank, {
      kind,
      amount: money.amount,
      currency: money.currency,
      occurredOn: date,
      merchant: party,
      description,
      confidence,
      externalRef: ref,
      cardLast4: last4,
      rawText: text,
    }),
  ];
}

export const crGenericNotificationSource: IngestionSource<string> = {
  kind: "bank_notification",
  parse(text: string, meta?: NotificationMeta): RawMovement[] {
    return parseCrGeneric(text, meta).filter((m) => m.amount > 0);
  },
};
