/**
 * Utilidades compartidas por los parsers de notificaciones bancarias de Costa
 * Rica. Todo PURO: solo texto de entrada, sin IO. Cada banco escribe sus
 * avisos distinto, pero los pedazos (monto con moneda, fecha tica, referencia,
 * últimos 4 de la tarjeta, aviso de rechazo) se repiten; aquí viven una sola vez.
 */

import type { NotificationMeta } from "@/lib/ingestion/types";

export type { NotificationMeta };

/** Quita tildes/diéresis para comparar sin depender del acento. */
export function deburr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Colapsa espacios, NBSP y saltos: un texto plano en una sola línea. */
export function flatten(s: string): string {
  return s
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Convierte "5,000.00" / "5.000,00" / "5 000,50" / "5000" a número. Regla: el ÚLTIMO
 * separador con exactamente 2 dígitos después es el decimal; el resto son miles.
 * Devuelve null si no hay dígitos.
 */
export function parseAmountLoose(raw: string): number | null {
  // Sin espacios y sin separadores colgando ("12,444.00," → "12,444.00").
  const s = raw.replace(/[\s ]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/\d/.test(s)) return null;
  const m = s.match(/^(.*?)([.,])(\d{1,2})$/);
  let intPart: string;
  let dec = "";
  if (m && m[3]!.length === 2) {
    intPart = m[1]!;
    dec = m[3]!;
  } else if (m && m[3]!.length === 1) {
    intPart = m[1]!;
    dec = m[3]! + "0";
  } else {
    intPart = s;
  }
  const digits = intPart.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseFloat(dec ? `${digits}.${dec}` : digits);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_TOKEN =
  "(?:CRC|USD|EUR|₡|¢|\\$|US\\$|colones|colon(?:es)?|d[oó]lares|dolares|euros)";
const NUMBER_TOKEN = "\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";

/**
 * Busca la primera pareja moneda+monto en cualquier orden: "CRC 12,345.00",
 * "₡12.345,00", "12,345.00 colones", "USD 19.99", "$19.99". Devuelve null si no hay.
 */
export function findMoney(text: string): { amount: number; currency: string } | null {
  const flat = flatten(text);
  const before = new RegExp(`(${CURRENCY_TOKEN})\\s*:?\\s*(${NUMBER_TOKEN})(?![\\d])`, "i");
  const after = new RegExp(`(${NUMBER_TOKEN})\\s*(${CURRENCY_TOKEN})(?![A-Za-z])`, "i");
  const a = flat.match(before);
  const b = flat.match(after);
  // Preferimos el match que aparezca primero en el texto.
  let pick: { cur: string; num: string } | null = null;
  if (a && b) {
    pick = a.index! <= b.index! ? { cur: a[1]!, num: a[2]! } : { cur: b[2]!, num: b[1]! };
  } else if (a) {
    pick = { cur: a[1]!, num: a[2]! };
  } else if (b) {
    pick = { cur: b[2]!, num: b[1]! };
  }
  if (!pick) return null;
  const amount = parseAmountLoose(pick.num);
  if (amount === null || amount <= 0) return null;
  return { amount, currency: mapCurrency(pick.cur) };
}

/** Token de moneda → ISO. Cualquier cosa que no sea dólar/euro se trata como colón. */
export function mapCurrency(token: string): string {
  const t = deburr(token).toLowerCase();
  if (t === "usd" || t === "$" || t === "us$" || t.startsWith("dolar")) return "USD";
  if (t === "eur" || t.startsWith("euro")) return "EUR";
  return "CRC";
}

const MONTHS_ES: Record<string, string> = {
  ene: "01",
  enero: "01",
  jan: "01",
  feb: "02",
  febrero: "02",
  mar: "03",
  marzo: "03",
  abr: "04",
  abril: "04",
  apr: "04",
  may: "05",
  mayo: "05",
  jun: "06",
  junio: "06",
  jul: "07",
  julio: "07",
  ago: "08",
  agosto: "08",
  aug: "08",
  sep: "09",
  set: "09",
  septiembre: "09",
  setiembre: "09",
  oct: "10",
  octubre: "10",
  nov: "11",
  noviembre: "11",
  dic: "12",
  diciembre: "12",
  dec: "12",
};

/**
 * Primera fecha reconocible en el texto → "YYYY-MM-DD". Entiende:
 *  - 04/09/2026, 4-9-2026, 04.09.2026 (día/mes/año, convención tica)
 *  - 04-09-2026 - 08:04 (asunto de BAC)
 *  - 2026-09-04 (ISO)
 *  - 4 de setiembre de 2026 / 4 de sep. 2026 / 04-sep-2026
 *  - Sep 4, 2026 (inglés abreviado)
 * Devuelve null si no hay ninguna.
 */
export function findDate(text: string): string | null {
  const flat = flatten(deburr(text));
  const iso = flat.match(/\b(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  const dmy = flat.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  const long = flat.match(
    /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|[-/])?\s*(20\d{2})\b/i,
  );
  const eng = flat.match(/\b([a-z]{3})\s+(\d{1,2}),\s*(20\d{2})\b/i);

  const candidates: Array<{ idx: number; value: string | null }> = [];
  if (iso) candidates.push({ idx: iso.index!, value: `${iso[1]}-${iso[2]}-${iso[3]}` });
  if (dmy) {
    const d = parseInt(dmy[1]!, 10);
    const mo = parseInt(dmy[2]!, 10);
    candidates.push({
      idx: dmy.index!,
      value: mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${dmy[3]}-${pad2(mo)}-${pad2(d)}` : null,
    });
  }
  if (long) {
    const mo = MONTHS_ES[long[2]!.toLowerCase()];
    candidates.push({ idx: long.index!, value: mo ? `${long[3]}-${mo}-${pad2(long[1]!)}` : null });
  }
  if (eng) {
    const mo = MONTHS_ES[eng[1]!.toLowerCase()];
    candidates.push({ idx: eng.index!, value: mo ? `${eng[3]}-${mo}-${pad2(eng[2]!)}` : null });
  }
  const valid = candidates.filter((c) => c.value).sort((x, y) => x.idx - y.idx);
  return valid[0]?.value ?? null;
}

function pad2(v: string | number): string {
  return String(v).padStart(2, "0");
}

/**
 * Valor tras una etiqueta ("Comercio:", "Monto:"), inline o en la línea siguiente.
 * Corta en el siguiente label conocido (`stopLabels`) para no arrastrar el resto del correo.
 */
export function fieldAfterLabel(
  text: string,
  label: string,
  stopLabels: string[] = [],
): string | null {
  const lines = text.split(/\r?\n/);
  const needle = deburr(label).toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const line = deburr(lines[i]!).toLowerCase();
    const idx = line.indexOf(needle);
    if (idx < 0) continue;
    const inline = lines[i]!.slice(idx + label.length).trim();
    if (inline) return cutAtStop(inline, stopLabels);
    for (let j = i + 1; j < lines.length; j++) {
      const v = lines[j]!.trim();
      if (v) return cutAtStop(v, stopLabels);
    }
    return null;
  }
  return null;
}

function cutAtStop(value: string, stopLabels: string[]): string | null {
  let out = value;
  for (const stop of stopLabels) {
    const re = new RegExp(`\\s{2,}|\\s+${escapeRe(stop)}\\s*:`, "i");
    const cut = out.split(re)[0];
    if (cut !== undefined) out = cut;
  }
  // Fin de oración seguido de otra etiqueta/frase ("ALMUERZO. Comprobante: 1") → corta ahí.
  out = out.split(/\.\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/)[0]!;
  out = out
    .replace(/^[:\-–\s]+/, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return out || null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Referencia/autorización/comprobante: el primer bloque de ≥4 dígitos tras una etiqueta de referencia. */
export function findReference(text: string): string | null {
  const flat = flatten(deburr(text));
  const m = flat.match(
    /(?:n[o°º.]*\s*(?:de\s+)?)?(?:referencia|autorizaci[oó]n|comprobante|documento|transacci[oó]n\s*(?:n[o°º.]*)?|ref\.?)\s*(?:n[o°º.]*|#)?\s*[:.]?\s*(\d{4,})/i,
  );
  return m?.[1] ?? null;
}

/** Últimos 4 de la tarjeta: "****2062", "terminada en 2062", "tarjeta ...2062", "XXXX-2062". */
export function findCardLast4(text: string): string | null {
  const flat = flatten(deburr(text));
  return (
    flat.match(/[*Xx]{3,}[\s-]*(\d{4})\b/)?.[1] ??
    flat.match(
      /(?:terminad[ao]\s+en|finaliza(?:da)?\s+en|ultimos\s+4\s+digitos?:?)\s*(\d{4})\b/i,
    )?.[1] ??
    flat.match(
      /tarjeta\s+(?:de\s+(?:cr[eé]dito|d[eé]bito)\s+)?(?:n[o°º.]*\s*)?[*Xx.]*\s*(\d{4})\b/i,
    )?.[1] ??
    null
  );
}

// Una transacción RECHAZADA trae comercio, monto y referencia igual que una
// aprobada: sin este guard se proponía como gasto real. Se busca en minúsculas
// y sin acentos.
const DECLINED_RE =
  /\b(rechazad[ao]|declinad[ao]|denegad[ao]|no aprobad[ao]|no fue aprobad[ao]|no se pudo procesar|transaccion fallida|fue rechazada|no se realizo)\b/;

/** ¿El aviso describe una transacción que NO ocurrió? */
export function isDeclinedNotification(text: string): boolean {
  return DECLINED_RE.test(deburr(text).toLowerCase());
}

/**
 * Bancos y cooperativas de Costa Rica con sus dominios de remitente y palabras de
 * marca. `code` es lo que se guarda en RawMovement.bankCode y en la propuesta.
 */
export interface CrBank {
  code: string;
  name: string;
  domains: string[];
  brands: RegExp;
}

export const CR_BANKS: CrBank[] = [
  {
    code: "BAC",
    name: "BAC Credomatic",
    domains: ["baccredomatic.cr", "baccredomatic.com", "bac.net"],
    brands: /\bBAC\b|credomatic/i,
  },
  {
    code: "BNCR",
    name: "Banco Nacional",
    domains: ["bncr.fi.cr", "bncr.com"],
    brands:
      /banco nacional|\bBNCR\b|\bBN\s?m[oó]vil\b|\bBN\b(?=\s+(?:internet|banking|d[eé]bito|cr[eé]dito|notificaciones))/i,
  },
  {
    code: "BCR",
    name: "Banco de Costa Rica",
    domains: ["bancobcr.com", "bcr.fi.cr"],
    brands: /banco de costa rica|\bBCR\b/i,
  },
  {
    code: "POPULAR",
    name: "Banco Popular",
    domains: ["bancopopular.fi.cr", "bp.fi.cr"],
    brands: /banco popular|\bBPDC\b/i,
  },
  {
    code: "SCOTIA",
    name: "Scotiabank",
    domains: ["scotiabank.com", "scotiabankcr.com"],
    brands: /scotiabank/i,
  },
  {
    code: "PROMERICA",
    name: "Promerica",
    domains: ["promerica.fi.cr", "bancopromerica.com"],
    brands: /promerica/i,
  },
  {
    code: "DAVIVIENDA",
    name: "Davivienda",
    domains: ["davivienda.cr", "davivienda.com", "davibank.cr"],
    brands: /davivienda|davibank/i,
  },
  { code: "LAFISE", name: "Lafise", domains: ["lafise.com", "lafise.fi.cr"], brands: /lafise/i },
  { code: "CATHAY", name: "Banco Cathay", domains: ["bancocathay.com"], brands: /cathay/i },
  {
    code: "BCT",
    name: "Banco BCT",
    domains: ["corporacionbct.com", "bct.fi.cr"],
    brands: /\bBCT\b/i,
  },
  {
    code: "IMPROSA",
    name: "Banco Improsa",
    domains: ["improsa.com", "bancoimprosa.com"],
    brands: /improsa/i,
  },
  { code: "GENERAL", name: "Banco General", domains: ["bgeneral.com"], brands: /banco general/i },
  {
    code: "COOPENAE",
    name: "Coopenae",
    domains: ["coopenae.fi.cr", "coopenae.com"],
    brands: /coopenae/i,
  },
  {
    code: "COOPESERVIDORES",
    name: "Coopeservidores (CS Ahorro y Crédito)",
    domains: ["coopeservidores.fi.cr", "cs.fi.cr"],
    brands: /coopeservidores|\bCS ahorro\b/i,
  },
  {
    code: "COOPEALIANZA",
    name: "Coopealianza",
    domains: ["coopealianza.fi.cr"],
    brands: /coopealianza/i,
  },
  {
    code: "COOPEANDE",
    name: "Coopeande",
    domains: ["coopeande1.com", "coopeande.fi.cr"],
    brands: /coopeande/i,
  },
  { code: "MUCAP", name: "Mucap", domains: ["mucap.fi.cr"], brands: /\bmucap\b/i },
  {
    code: "MUTUAL",
    name: "Grupo Mutual",
    domains: ["grupomutual.fi.cr", "mutualalajuela.fi.cr"],
    brands: /grupo mutual|mutual alajuela/i,
  },
  {
    code: "CAJA_ANDE",
    name: "Caja de ANDE",
    domains: ["cajadeande.fi.cr"],
    brands: /caja de ande/i,
  },
  { code: "PRIVAL", name: "Prival", domains: ["prival.com"], brands: /\bprival\b/i },
];

/** Identifica el banco por el dominio del remitente primero y por la marca en el texto después. */
export function detectBank(text: string, meta?: NotificationMeta): CrBank | null {
  const from = (meta?.from ?? "").toLowerCase();
  if (from) {
    for (const b of CR_BANKS) {
      if (b.domains.some((d) => from.endsWith(`@${d}`) || from.endsWith(`.${d}`))) return b;
    }
  }
  const haystack = `${meta?.subject ?? ""}\n${text}`;
  for (const b of CR_BANKS) {
    if (b.brands.test(haystack)) return b;
  }
  return null;
}
