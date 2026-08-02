import "server-only";

/**
 * Router de IA por complejidad (R1). Abarata las CONSULTAS de dato: los intents comunes se
 * atrapan con patrones (CERO tokens) o con un clasificador Flash-Lite barato, se responden con
 * la cifra del MOTOR determinista (ToolContext, ya calculada) y una plantilla; el RAZONAMIENTO
 * (proyecciones, consejo, comparaciones) cae al modelo completo como hoy.
 *
 * PRINCIPIO: nunca degradar la comprensión para ahorrar tokens. Ante la mínima duda → null
 * (escala al razonamiento). La cifra SIEMPRE sale del motor; el modelo chico solo clasifica —
 * jamás inventa un número.
 *
 * Vive DENTRO de financeChatWithTools → cubre web y WhatsApp (ambos pasan por ahí).
 */
import { formatMoney } from "@/lib/format";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import type { AIChatResponse } from "@/lib/ai/types";
import { detectCreateAction } from "@/lib/ai/action-lane";
import { userToday } from "@/lib/time/user-time";
import { projectInvestment } from "@/lib/ai/tools";
import {
  parseMultiScope,
  parsePriceModifier,
  filterByScope,
  computeMultiScenario,
  buildMultiReply,
  formatMarketMoney,
  type ScopeKind,
  type HoldingScenarioInput,
} from "@/lib/ai/market-scope";
import { buildEvidencePack } from "@/lib/ai/investment-report/evidence";
import { renderEvidenceReport } from "@/lib/ai/investment-report/render";
import type { FinancialContext, ToolContext } from "@/lib/ai/orchestrator";

/**
 * Carril que resolvió la respuesta (para medir el ahorro de tokens). "deep" = informe largo armado
 * por plantilla sobre el paquete de evidencia (determinista, 0 tokens); se mide aparte de "template"
 * porque su costo es de LECTURAS, no de modelo.
 */
export type RouterLane = "template" | "lite" | "reasoning" | "deep";

export type RoutedQuery = {
  response: AIChatResponse; // reply crudo (el orchestrator le aplica el guardrail)
  tokensIn: number;
  tokensOut: number;
  lane: RouterLane;
};

/** Modelo chico: mismo adaptador Gemini, solo cambia el string (sin integración nueva). */
const LITE_MODEL = "gemini-2.5-flash-lite";

type Intent =
  // Números patrimoniales — los TRES, distintos (todos "capital al 8% que cubre X gasto"):
  | "numero_seguridad"
  | "numero_independencia"
  | "numero_libertad"
  // R1 — datos ya en ToolContext (motor determinista):
  | "metas"
  // "cuáles metas debo aportar este mes" → SOLO metas de ahorro recurrentes con su aporte (no sobres):
  | "metas_a_aportar"
  // "cuánto me falta pa {meta}" → brecha de una meta por nombre (tc.goals):
  | "falta_meta"
  // "¿cuál es mi meta más cercana a completarse?" → meta con mayor progreso (tc.goals):
  | "meta_cercana"
  | "cuota_deuda"
  // DEFENSA (fondo de emergencia/paz, meses de colchón, "si me botan") → ctx.defenseFunds/mesesDeColchon:
  | "defensa_fondo"
  // "¿cuánto ahorro al mes?" → aportes a metas (compromisoDesglose.metas):
  | "ahorro_mensual"
  // Inversiones: "cuánto invertido / cómo va el portafolio / ganancia o pérdida" → ctx.investment*:
  | "resumen_inversiones"
  // "analizame el portafolio / informe de mis inversiones" → INFORME determinista (carril deep):
  // paquete de evidencia (posiciones, concentración, moneda, brecha, deuda, defensa) + plantilla:
  | "informe_inversion"
  // "¿cuánto aporto de DCA al mes?" → compromisoDesglose.dca:
  | "dca_mensual"
  // R2 — datos ya en FinancialContext (ctx), 0 fetch, ambos canales:
  | "gasto_mes"
  | "ingreso_mes"
  | "gasto_categoria"
  // "cuánto (me queda) libre pa gastar / cuánto me sobra / flujo libre" → flujo libre (ctx.freeCashflow),
  // NO el saldo de liquidez (que daba ₡0):
  | "flujo_libre"
  // R2 — requieren lectura fresca (session-based → web; WhatsApp escala):
  | "saldo_liquidez"
  // "cuánto me queda en/de {sobre(s)}" → restante por sobre (getSobreRemaining), soporta varios:
  | "saldo_sobre"
  | "ultimos_movimientos"
  // Sobres agrupados por frasco (determinista, sin alucinar) — lectura fresca:
  | "listar_sobres"
  // "¿me puedo comprar X?" → mapea al sobre y dice el restante (determinista) — lectura fresca:
  | "puedo_gastar"
  // Precio/ATH/"si vendo X en el máximo" → llama datos_de_mercado DETERMINISTA (no a criterio del LLM):
  | "datos_mercado"
  // "¿cómo llego a mi independencia? / cuánto invertir para llegar" → proyección determinista hacia
  // el número de INDEPENDENCIA (sin pedir estilo de vida deseado):
  | "plan_independencia"
  // LIBRO DIARIO: consulta real de transacciones por fecha/periodo/comercio/sobre, con agregación
  // ("¿qué días gasto más?", "¿cuánto le gasté a Walmart?", "¿gasté más este mes que el pasado?").
  // Lectura fresca; el dato NO está en ctx (que solo trae agregados del mes en curso):
  | "consulta_transacciones"
  // HISTORIAL/TENDENCIA: serie por periodo + variación desde los snapshots ("¿cómo cambió mi
  // patrimonio?", "¿cómo vengo con el gasto?"). Lectura fresca:
  | "consulta_historial"
  // DETALLE por dominio: pagos de una deuda, aportes a una meta, compras, dividendos,
  // trazabilidad de liquidez. Lectura fresca:
  | "consulta_detalle";

const KNOWN_INTENTS: Intent[] = [
  "numero_seguridad",
  "numero_independencia",
  "numero_libertad",
  "metas",
  "metas_a_aportar",
  "falta_meta",
  "meta_cercana",
  "defensa_fondo",
  "ahorro_mensual",
  "resumen_inversiones",
  "informe_inversion",
  "dca_mensual",
  "cuota_deuda",
  "gasto_mes",
  "ingreso_mes",
  "gasto_categoria",
  "flujo_libre",
  "saldo_liquidez",
  "saldo_sobre",
  "ultimos_movimientos",
  "listar_sobres",
  "puedo_gastar",
  "datos_mercado",
  "plan_independencia",
  "consulta_transacciones",
  "consulta_historial",
  "consulta_detalle",
];

/** Intents cuyo dato NO está en ctx: se resuelven con lectura fresca (solo con sesión web). */
const FETCH_INTENTS: ReadonlySet<Intent> = new Set([
  "saldo_liquidez",
  "saldo_sobre",
  "ultimos_movimientos",
  "listar_sobres",
  "puedo_gastar",
  "consulta_transacciones",
  "consulta_historial",
  "consulta_detalle",
]);

// Señales de RAZONAMIENTO: si aparecen, NO es una consulta simple → escalar. Es la red de
// seguridad de "ante duda, escalá": una pregunta de consejo/proyección nunca se atrapa por patrón.
// "recort|reduc|optimiz" entran acá porque "¿dónde puedo recortar gastos?" no es una
// consulta de dato: pide un análisis de qué sobres discrecionales pesan más. Sin esto, el
// clasificador lite la mandaría a gasto_categoria y contestaría un total, no un consejo.
//
// Está partida en dos a propósito: "cómo" es la señal MÁS ambigua de la lista —encabeza
// tanto "¿cómo invierto mejor?" (consejo) como "¿cómo van mis metas?" (dato)—, así que los
// carriles que necesitan rescatar una consulta factual pueden preguntar por el RESTO de las
// señales sin ella. `REASONING_CUES` sigue siendo exactamente la unión de ambas.
const REASONING_SIN_COMO =
  /deber[ií]a|conviene|qu[eé] hago|estrategia|plan\b|recomend|proyec|si (?:invierto|aporto|abono|pago|ahorro)|abon|extra|escenario|comparar?|vs\.?|mejor opci|cu[aá]nto tendr[ií]a|\ben cu[aá]nto\b|en \d+\s*a[nñ]os|simula|recort|reduc(?:ir)?\s+(?:mis\s+)?gast|optimiz/i;
const REASONING_CUES = new RegExp(`\\bc[oó]mo\\b|${REASONING_SIN_COMO.source}`, "i");

/** Meses en español, para reconocer "en marzo" como periodo. */
const MESES_RE =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;

/**
 * Marcador temporal EXPLÍCITO en la pregunta → el `periodo` que entiende
 * `resolverRango`. Devuelve null si no hay ninguno: eso es lo que distingue una
 * consulta del libro diario ("¿cuánto gasté la semana pasada?") de la pregunta
 * genérica del mes en curso, que sigue yendo a `gasto_mes` con la cifra del contexto.
 *
 * "este mes" a secas devuelve null a propósito: no queremos regresionar `gasto_mes`.
 */
export function extractPeriodo(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bhoy\b/.test(t)) return "hoy";
  if (/\bayer\b/.test(t)) return "ayer";
  if (/\bsemana\s+pasada\b|\bsemana\s+anterior\b|\bla\s+semana\s+pasada\b/.test(t)) return "semana_pasada";
  if (/\besta\s+semana\b|\ben\s+la\s+semana\b|\bde\s+la\s+semana\b/.test(t)) return "semana";
  if (/\bmes\s+pasado\b|\bmes\s+anterior\b/.test(t)) return "mes_pasado";
  if (/\ba[nñ]o\s+pasado\b|\ba[nñ]o\s+anterior\b/.test(t)) return "anio_pasado";
  if (/\beste\s+a[nñ]o\b|\bdel\s+a[nñ]o\b|\ben\s+el\s+a[nñ]o\b/.test(t)) return "anio";
  const dias = t.match(/[uú]ltimos?\s+(\d+)\s*d[ií]as?|\b(\d+)\s*d[ií]as\b/);
  if (dias) {
    const n = Number(dias[1] ?? dias[2]);
    if (Number.isFinite(n) && n > 0) return `ultimos_${n}_dias`;
  }
  const mes = t.match(MESES_RE);
  if (mes?.[1]) return mes[1] === "setiembre" ? "septiembre" : mes[1];
  return null;
}

/**
 * Término de la consulta tras "en/a/con" ("cuánto gasté EN walmart"). Puede ser un
 * comercio o un sobre — el motor lo resuelve contra ambos (`termino`). Se descartan
 * las palabras que en realidad son marcadores de tiempo o muletillas, para no filtrar
 * por "total" en "¿cuánto gasté en total?".
 */
const TERMINO_STOP =
  /^(?:total|todo|general|promedio|hoy|ayer|esta semana|la semana|el mes|este mes|el a[nñ]o|este a[nñ]o|qu[eé]|eso|ello|mi|mis)$/i;

export function extractTerminoGasto(text: string): string | null {
  const m = text.match(
    /(?:gast[eéoó]\w*|pagu[eé]|compr[eéoó]\w*)\s+(?:le\s+)?(?:en|a|con|para)\s+(?:el\s+|la\s+|los\s+|las\s+|mi\s+|mis\s+|un\s+|una\s+)?([^,.?!¿¡]+)/i,
  );
  let t = m?.[1]?.trim();
  if (!t) return null;
  // Corta el marcador temporal pegado al término ("en walmart este mes" → "walmart").
  t = t
    .replace(
      /\s+(?:hoy|ayer|esta semana|la semana pasada|semana pasada|este mes|el mes pasado|mes pasado|este a[nñ]o|el a[nñ]o pasado|a[nñ]o pasado|en total|en \w+ [uú]ltimos? \d+ d[ií]as)\b.*$/i,
      "",
    )
    .replace(new RegExp(`\\s+(?:en|de|durante)?\\s*${MESES_RE.source}\\b.*$`, "i"), "")
    // Preposición huérfana que quedó tras cortar el marcador temporal ("Walmart en" → "Walmart").
    .replace(/\s+(?:en|de|a|con|para|del|desde|hasta|durante)$/i, "")
    .trim();
  if (!t || t.length < 2 || TERMINO_STOP.test(t)) return null;
  return t;
}

/**
 * Nombre de la entidad concreta en una consulta de detalle ("cuánto le he pagado a la
 * TARJETA BAC", "mis aportes a VIAJE A JAPÓN"). Se corta en la palabra del dominio para
 * no arrastrarla al nombre. null → el detalle del dominio completo.
 */
export function extractNombreDominio(text: string): string | null {
  const m = text.match(
    /(?:pagad[oa]?|aportad[oa]?|abonad[oa]?|invertid[oa]?|pagos?|aportes?|abonos?|compras?|dividendos?)\s+(?:a|de|en|para|del|a la|al)\s+(?:mi\s+|mis\s+|la\s+|el\s+|los\s+|las\s+)?([^,.?!¿¡]+)/i,
  );
  let n = m?.[1]?.trim();
  if (!n) return null;
  // "…la tarjeta este mes" → "tarjeta"; no queremos el marcador temporal en el nombre.
  n = n
    .replace(
      /\s+(?:hoy|ayer|esta semana|la semana pasada|este mes|el mes pasado|este a[nñ]o|en total|hasta ahora|hasta hoy)\b.*$/i,
      "",
    )
    .trim();
  // Una palabra genérica del dominio no es un nombre propio: eso es "todo el dominio".
  if (!n || n.length < 2 || /^(?:deuda|deudas|meta|metas|cuenta|cuentas|todo|todos|eso)$/i.test(n)) {
    return null;
  }
  return n;
}

/** Extrae el nombre de una deuda tras el verbo, limpiando conectores ("de mi X" → "X"). */
function extractDebtName(text: string): string | null {
  const m = text.match(/(?:cuota|pago(?:\s+m[ií]nimo)?|cu[aá]nto pago)\s+(.+?)[\?\.!¿¡]*$/i);
  const name = m?.[1]?.replace(/^(?:de |del |de la |de mi |por |mi |la |el )+/i, "").trim();
  return name && name.length >= 2 ? name : null;
}

/** Forma "verbo + ítem": el ítem viene DESPUÉS del verbo ("me alcanza para X", "me puedo comprar X"). */
const AFFORD_VERB_RE =
  /(?:me\s+puedo\s+comprar|me\s+puedo\s+dar|puedo\s+darme|me\s+lo\s+puedo\s+dar|me\s+alcanza\s+para|me\s+da\s+para|puedo\s+gastar(?:\s+(?:en|para))?)\s+(.+?)[\?\.!¿¡]*$/i;

/** Señal SUELTA de "¿me alcanza?" que puede venir SIN el ítem detrás ("un helado, me alcanza?"). */
const AFFORD_LOOSE_RE =
  /\bme\s+alcanza\b|\bme\s+da\b|\balcanza(?:r[ií]a|r[aá])?\b|\bme\s+lo\s+puedo\s+dar\b|\bpuedo\s+con\b|\bpuedo\s*[?¿]|\bme\s+puedo\s+(?:comprar|dar)\b/i;

/** Ítem de COMPRA en el resto de la frase: "quiero un/una X", "un/una X" (antes de coma/fin). El
 *  artículo indefinido / verbo de compra es el guard anti-falso-positivo (no agarra "el tiempo"). */
const AFFORD_ITEM_RE =
  /(?:quiero|comprar(?:me)?|darme|gustar[ií]a)\s+(?:un|una|unos|unas)\s+([^,.?!¿¡]+)|(?:^|[,\s])(?:un|una|unos|unas)\s+([^,.?!¿¡]+)/i;

/** Monto + MONEDA SOLO si viene con señal de moneda (₡/$/…) o multiplicador (mil/k); si no, null (no
 *  agarra números sueltos como "2 cervezas"). es-CR: "." = miles, "," = decimales. La moneda sale del
 *  SÍMBOLO (₡/crc → CRC, $/usd → USD, col$ → COP, mx$ → MXN); sin símbolo (mil/k) → null (= "la de
 *  visualización"). NUNCA se asume que "₡8.000" está en la moneda de display: el caller lo convierte. */
export function extractAmount(text: string): { monto: number; moneda: string | null } | null {
  const m = text.match(/(₡|\$|col\$|mx\$|crc|usd)\s*([\d.,]+)|(\d[\d.,]*)\s*(mil|k)\b/i);
  if (!m) return null;
  const sym = (m[1] ?? "").toLowerCase();
  const raw = (m[2] ?? m[3] ?? "").trim();
  const mult = m[4] ? 1000 : 1;
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const moneda =
    sym === "₡" || sym === "crc" ? "CRC" :
    sym === "col$" ? "COP" :
    sym === "mx$" ? "MXN" :
    sym === "$" || sym === "usd" ? "USD" :
    null;
  return { monto: n * mult, moneda };
}

/**
 * Descripción del ítem de la pregunta de afford, en CUALQUIER orden:
 *   A) "verbo + ítem" ("me alcanza para un helado") → captura tras el verbo.
 *   B) señal suelta + ítem en el resto ("quiero un helado, me alcanza?", "un helado, ¿me alcanza?")
 *      → toma el "un/una X" de compra. El artículo indefinido / verbo de compra evita falsos
 *      positivos como "me alcanza el tiempo/la plata para llegar" (que no rutean a afford).
 * Quita monto y artículo inicial → "un helado" ⇒ "helado". null si no hay ítem de compra.
 */
export function extractAffordDesc(text: string): string | null {
  const t = text.trim();
  let desc = t.match(AFFORD_VERB_RE)?.[1]?.trim() ?? null;
  if (!desc) {
    const mi = t.match(AFFORD_ITEM_RE);
    desc = (mi?.[1] ?? mi?.[2])?.trim() ?? null;
  }
  if (!desc) return null;
  desc = desc
    // corta una pregunta de afford que haya quedado pegada al ítem ("helado, me alcanza?").
    .replace(/,?\s*¿?\s*(?:me\s+alcanza|me\s+da|puedo|alcanza)\b.*$/i, " ")
    .replace(/\b(?:algo\s+de|de|por|unos?|unas?)\s+(?=(?:₡|\$|col\$|mx\$)|\d)/gi, " ")
    .replace(/(?:₡|\$|col\$|mx\$|crc|usd)\s*[\d.,]+\s*(?:mil|k)?/gi, " ")
    .replace(/\b\d[\d.,]*\s*(?:mil|k)\b/gi, " ")
    .replace(/^(?:un|una|unos|unas|el|la|los|las)\s+/i, "") // "un helado" ⇒ "helado"
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,.?!¿¡]+$/g, "")
    .trim();
  return desc.length >= 2 ? desc : null;
}

/**
 * Respuesta a "¿me puedo comprar X?" a partir de las cifras del MOTOR (getSobreRemaining) — pura y
 * testeable. La app INFORMA y GUÍA, no ordena; la decisión es del usuario. Nunca inventa el saldo.
 */
export function affordReply(
  path: string,
  r: { budget: number; spent: number; remaining: number; hasBudget: boolean },
  amount: number | null,
  money: (n: number) => string,
): string {
  if (!r.hasBudget) {
    return `No tenés presupuesto en ${path} este mes; asignale uno y te digo cuánto te queda.`;
  }
  if (r.remaining <= 0) {
    return `Ya usaste tu presupuesto de ${path} (${money(r.spent)} de ${money(r.budget)}). Si te lo das, te estarías pasando.`;
  }
  if (amount !== null) {
    if (amount <= r.remaining) {
      return `En ${path} te quedan ${money(r.remaining)} este mes; con ${money(amount)} te quedarían ${money(r.remaining - amount)}.`;
    }
    return `En ${path} te quedan ${money(r.remaining)} este mes, y ${money(amount)} se pasa por ${money(amount - r.remaining)}. Si te lo das, te estarías pasando.`;
  }
  return `En ${path} te quedan ${money(r.remaining)} este mes.`;
}

/** Señales de pregunta de MERCADO: precio, ATH/máximo, o "si vendo X en el máximo/ATH". */
const MARKET_CUE_RE =
  /\bath\b|m[aá]ximo hist[oó]rico|\bm[aá]ximo\b|precio (?:de|actual|hoy)|(?:cu[aá]nto|a c[oó]mo) (?:vale|est[aá]|cuesta)|si (?:vendo|vendiera)/i;
/** ATH/máximo específicamente (para saber si el usuario pide el escenario "al máximo"). */
const MARKET_ATH_RE = /\bath\b|m[aá]ximo/i;

/**
 * Señales del carril DEEP (informe de inversiones), en DOS ejes que deben coincidir ambos:
 *  - INFORME_CUE_RE: el pedido ("informe", "reporte", "análisis/analizame", "revisión/revisá",
 *    "diagnóstico", "radiografía", "auditoría").
 *  - PORTAFOLIO_OBJ_RE: el objeto ("portafolio/portfolio", "cartera", "inversiones", "posiciones").
 * Con una sola señal NO alcanza: "análisis de BTC" no es un informe de portafolio, y "cuánto tengo
 * invertido" es un dato puntual (resumen_inversiones). El orden entre ambas es libre.
 *
 * Ojo con los acentos: `\w` es ASCII, así que un sufijo acentuado ("revisá", "auditoría") rompería
 * el \b final. Los stems se cortan antes de la tilde (revis\w* cubre revisá/revisión/revisame).
 */
const INFORME_CUE_RE =
  /\b(?:informe|reporte|an[aá]lisis|analiz\w*|revis\w*|diagn[oó]stic\w*|radiograf[ií]a|audit\w*)\b/i;
const PORTAFOLIO_OBJ_RE = /\b(?:portafolios?|portfolios?|cartera|inversi[oó]n(?:es)?|posiciones)\b/i;

/**
 * Extrae el símbolo objetivo de una pregunta de mercado: un ticker en MAYÚSCULAS (2-6 letras/
 * dígitos) o el que matchee un símbolo/nombre de las posiciones del usuario. `known` = símbolos y
 * nombres de sus holdings (para resolver "kamino"/"bitcoin" además del ticker). Devuelve el TICKER.
 */
export function extractMarketSymbol(text: string, known: { symbol: string | null; name: string }[]): string | null {
  // 1) Ticker explícito en mayúsculas (BTC, KMNO, VOO). Evita palabras comunes en mayúscula.
  const STOP = new Set(["ATH", "USD", "CRC", "EUR", "IA", "ETF"]);
  const upper = text.match(/\b[A-Z]{2,6}\d?\b/g)?.filter((w) => !STOP.has(w)) ?? [];
  const bySymbol = new Set(known.map((k) => k.symbol?.toUpperCase()).filter(Boolean));
  const hit = upper.find((w) => bySymbol.has(w)) ?? upper[0];
  if (hit) return hit;
  // 2) Por nombre de la posición ("si vendo mi bitcoin en el ATH") → su ticker.
  const lower = text.toLowerCase();
  const byName = known.find((k) => k.name && lower.includes(k.name.toLowerCase()) && k.symbol);
  return byName?.symbol ?? null;
}

/** Términos que denotan LIQUIDEZ (no un sobre): un nombre así NO es un sobre nombrado. */
const LIQUIDITY_TERM = /\bl[ií]quido\b|liquidez|efectivo|disponible|\bcuentas?\b|\bbanco\b/i;

/**
 * Nombres de SOBRE tras "cuánto me queda/tengo/llevo … en/de {X, Y}". Soporta varios (coma / "y"),
 * limpia coletillas ("este mes", "el sobre de") y descarta términos de liquidez u otros tópicos.
 * [] si no hay un nombre de sobre claro (→ el router NO rutea a saldo_sobre).
 */
export function extractSobreNames(text: string): string[] {
  const m = text.match(/cu[aá]nto\s+(?:me\s+queda|tengo|llevo(?:\s+gastado)?)\b[\s\S]*?\b(?:en|de|del)\b\s+(.+)/i);
  if (!m || !m[1]) return [];
  const tail = m[1]
    .replace(/\b(?:este mes|del mes|hasta fin de mes|ahora mismo|ahora|hoy)\b/gi, " ")
    .replace(/[?¿.!]+/g, " ");
  const stopArticle = /^(?:el sobre de|del sobre de|sobre de|sobre|mi|mis|la|el|los|las|un|una|de)\s+/i;
  const names = tail
    .split(/\s*(?:,|\by\b|\be\b)\s*/i)
    .map((p) => {
      let s = p.trim();
      while (stopArticle.test(s)) s = s.replace(stopArticle, "").trim();
      return s;
    })
    .filter(
      (p) => p.length >= 3 && !LIQUIDITY_TERM.test(p) && !/\b(?:pendiente|aporte|inversi|ahorro|deuda|meta|libertad|independencia|ingres|gan[eéoó])\b/i.test(p),
    );
  return [...new Set(names.map((n) => n.toLowerCase()))].slice(0, 4);
}

/**
 * true si la pregunta tiene OTRA parte/pregunta que el carril de sobre no cubre (dos signos de
 * pregunta, o un "y … {aporte/inversión/ahorro/deuda/pendiente}"). El router debe ESCALAR, no
 * responder una sola cosa mal.
 */
export function isMultiPart(text: string): boolean {
  const twoQ = (text.match(/\?/g) ?? []).length >= 2;
  const secondTopic = /\by\s+(?:hay|tengo|ten[eé]s|cu[aá]nto|qu[eé]|est[aá]|falta|el|un)\b[\s\S]*?(?:aporte|inversi|pendiente|ahorro|deuda|meta|ingres|libertad|independencia)/i.test(text);
  return twoQ || secondTopic;
}

/**
 * Diccionario de SLANG latino (CR/MX/CO/AR/VE/PE/CL): normaliza sinónimos a un token canónico ANTES
 * de matchear, para que "¿en qué se me va la lana/guita/pisto?" caiga en el mismo carril que "la plata".
 * Solo toca palabras coloquiales inequívocas (no altera montos, símbolos ni nombres de sobre).
 */
const SLANG_MAP: [RegExp, string][] = [
  [/\b(?:lana|guita|pisto|billete|biyuyo|varo|feria|plata|luca|luka|money|pasta|mosca|billullo)\b/gi, "dinero"],
  [/\bpa'?\b/gi, "para"], // "pa" / "pa'" → "para"
];
export function normalizeSlang(text: string): string {
  let t = text;
  for (const [re, rep] of SLANG_MAP) t = t.replace(re, rep);
  return t;
}

/** PATRONES: intent + params con CERO tokens. null si no matchea con confianza. */
export function matchIntent(text: string): { intent: Intent; params: Record<string, unknown> } | null {
  // Normalizamos el slang de dinero ("lana/guita/pisto…" → "dinero") antes de matchear. No afecta la
  // extracción de montos (usa ₡/$ y dígitos) ni de nombres de sobre (no son palabras de slang).
  const t = normalizeSlang(text.trim());

  // Pregunta COMPUESTA ("¿cuánto gasto y cuánto ahorro al mes?"): dos consultas distintas en una. Un
  // carril determinista respondería SOLO una mitad (la auditoría lo cazó) → ESCALAR al LLM, que las
  // cubre juntas. Requiere DOS "cuánto" unidos por "y" (no atrapa un "¿y cuánto…?" de arrastre solo).
  if (/cu[aá]nto\b[\s\S]*?\by\s+cu[aá]nto\b/i.test(t)) return null;

  // ── DETALLE POR DOMINIO (consulta_detalle). Va ANTES de cuota_deuda/metas/resumen_inversiones,
  //    que responden la FOTO (saldo, progreso, valor) cuando la pregunta es por el HISTORIAL de
  //    movimientos ("cuánto le he pagado", "cuál fue mi último pago", "mis dividendos").
  //    Exige señal de acumulado / "último movimiento" / trazabilidad + un dominio reconocible.
  //    Va al TOPE de matchIntent: resumen_inversiones ("cuánto…invertido") y REASONING_CUES
  //    ("cómo", "último") se lo comían. Las condiciones son estrictas, así que no roba nada.
  {
    // "he pagado / llevo pagado / cuánto le he aportado": acumulado, no la cuota de este mes.
    const acumulado =
      // El participio es OBLIGATORIO. Un "cuánto llevo…" suelto se comía "cuánto llevo
      // AHORRADO en mis metas", que es progreso (metas), no el historial de aportes.
      // Por eso `ahorrad` NO está en la lista: pertenece a la foto, no al detalle.
      /\b(?:he|has|llevo|tengo)\s+(?:pagad|aportad|abonad|invertid|sacad|retirad|puesto|metido)/i.test(t) ||
      /\bhistorial\s+de\s+(?:pagos?|aportes?|compras?)|\btod[oa]s\s+(?:mis|los|las)\s+(?:pagos?|aportes?|compras?)/i.test(t);
    const ultimoMov =
      /[uú]ltim[oa]s?\s+(?:pago|aporte|abono|compra|dividendo)|\bcu[aá]ndo\s+(?:pagu[eé]|aport[eé]|compr[eé])/i.test(t);
    // La trazabilidad de liquidez ("de dónde salió", "a dónde fue") ES la consulta: no
    // necesita señal de acumulado, la pregunta ya pide el movimiento.
    const trazabilidad =
      /\b(?:de|a)\s+d[oó]nde\s+(?:sali[oó]|vino|fue|se\s+fue|lo\s+saqu[eé])|\btrazabilidad\b/i.test(t);
    const dominio =
      /\bdividendos?\b/i.test(t) ? "dividendos"
      : /\bdeuda|\btarjeta|\bpr[eé]stamo|\bcr[eé]dito\b/i.test(t) ? "deudas"
      : /\bmeta\b|\bmetas\b|\bahorro\s+para\b/i.test(t) ? "metas"
      : /\bcompras?\s+de\b|\bactivo\b|\bacci[oó]n(?:es)?\b|\bcripto\b|\betf\b/i.test(t) ? "inversiones"
      : /\bcuenta\b|\bcuentas\b|\bliquidez\b|\bde\s+d[oó]nde\s+(?:sali[oó]|vino)|\ba\s+d[oó]nde\s+(?:fue|se\s+fue)/i.test(t) ? "liquidez"
      : null;
    // Los dividendos son inequívocos: la sola mención ya es una consulta de detalle.
    if (dominio && (acumulado || ultimoMov || trazabilidad || dominio === "dividendos")) {
      return {
        intent: "consulta_detalle",
        params: { dominio, nombre: extractNombreDominio(t), tope: ultimoMov ? 1 : 10 },
      };
    }
  }


  // ── Carriles nuevos (van ANTES de datos_mercado y del guard de REASONING_CUES, que atraparían
  //    "cuánto vale" / "cómo va" / "debería" y los mandaría al LLM). Todos deterministas, cifra del motor. ──

  // DEFENSA (fondo de emergencia/paz, meses de colchón, "si me botan cuánto aguanto", "¿estoy blindado?").
  if (
    /fondo de emergencia|fondo de paz|de emergencia\b|\bcolch[oó]n\b|si me (?:botan|despiden|corren|echan|largan)|me quedo sin (?:trabajo|empleo|chamba|pega)|blindad|protegid|(?:cu[aá]ntos?\s+)?meses (?:de colch|aguant|de respaldo)|si (?:viene|cae) una (?:vara|situaci)/i.test(t)
  ) {
    const focus =
      /\bpaz\b/i.test(t)
        ? "paz"
        : /\bcolch[oó]n\b|si me (?:botan|despiden|corren|echan|largan)|aguant|(?:cu[aá]ntos?\s+)?meses|me quedo sin/i.test(t)
          ? "colchon"
          : "emergencia";
    return { intent: "defensa_fondo", params: { focus } };
  }

  // INFORME de inversiones (carril DEEP, determinista): "analizame el portafolio", "revisión de mis
  // inversiones", "hacé un informe de mi cartera". Va ANTES de resumen_inversiones (que matchea
  // "cuánto/cómo va/valor" y se lo comería) y antes del guard de REASONING_CUES ("análisis"/"cómo"
  // lo mandarían al LLM). Exige AMBAS señales — pedido de informe + objeto portafolio — en cualquier
  // orden; "cuánto tengo invertido" (sin señal de informe) sigue siendo resumen_inversiones, y un
  // escenario de venta ("si vendo…") no es un informe.
  if (INFORME_CUE_RE.test(t) && PORTAFOLIO_OBJ_RE.test(t) && !/\bsi\s+vend/i.test(t)) {
    return { intent: "informe_inversion", params: {} };
  }

  // INVERSIONES — resumen del portafolio (NO un símbolo puntual como "mi ETH", que va a datos_mercado).
  // Se excluye la frase de restante-de-sobre ("me queda en/de {sobre}"): esa es saldo_sobre aunque
  // mencione "inversión" en otra parte ("…¿y hay aporte de inversión pendiente?").
  if (
    /\b(?:portafolio|portfolio|cartera|inversi[oó]n(?:es)?|invertid[oa]s?)\b/i.test(t) &&
    /cu[aá]nto|c[oó]mo va|valor|gan[aeáéoó]|p[eé]rd|rinde|rendimiento|\bvoy\b|total/i.test(t) &&
    !/\bsi\s+vend/i.test(t) &&
    !/\bme queda\s+(?:en|de|del)\b/i.test(t)
  ) {
    return { intent: "resumen_inversiones", params: {} };
  }
  // DCA mensual ("¿cuánto aporto de DCA al mes?").
  if (/\bdca\b|cu[aá]nto\s+aporto\s+(?:de\s+dca\s+)?(?:al mes|mensual|por mes|cada mes)/i.test(t)) {
    return { intent: "dca_mensual", params: {} };
  }

  // AHORRO — "¿cuánto ahorro al mes?" (presente, cifra actual; NO "cuánto debo guardar para…", que proyecta).
  if (/cu[aá]nto\s+(?:ahorro|guardo|aparto)\s+(?:al mes|mensual(?:mente)?|por mes|en total)/i.test(t)) {
    return { intent: "ahorro_mensual", params: {} };
  }
  // META más cercana a completarse.
  if (/meta\s+m[aá]s\s+(?:cercana|pr[oó]xima)|(?:cu[aá]l|qu[eé]).*meta.*(?:m[aá]s cerca|por completar|casi)/i.test(t)) {
    return { intent: "meta_cercana", params: {} };
  }
  // "¿Cuánto me falta pa {meta}?" (por nombre). Defensa/independencia ya se atraparon arriba.
  const faltaMeta = t.match(/cu[aá]nto\s+(?:me\s+)?falta\s+(?:para|pa)\s+(.+?)[\?\.!¿¡]*$/i);
  if (faltaMeta?.[1]) {
    return { intent: "falta_meta", params: { metaName: faltaMeta[1].replace(/^(?:el|la|los|las|mi|mis|un|una)\s+/i, "").trim() } };
  }

  // Precio/ATH/"si vendo X en el máximo": carril DETERMINISTA (llama datos_de_mercado, no depende
  // de que el LLM decida). Antes que REASONING_CUES ("si vendo" no está ahí, pero "máximo" podría
  // solaparse con otras señales) para garantizar que estas preguntas NO caigan al modelo suelto.
  if (MARKET_CUE_RE.test(t)) {
    return { intent: "datos_mercado", params: { text: t, wantsAth: MARKET_ATH_RE.test(t) } };
  }

  // PLAN de independencia (proyección determinista hacia el número de INDEPENDENCIA). ANTES de
  // REASONING_CUES (que atrapa "cómo/plan/proyec") para no caer al LLM. "libertad financiera" acá =
  // la vida ACTUAL del usuario (independencia), como la usa coloquialmente. NO pide vida deseada.
  if (
    /(?:c[oó]mo|cu[aá]ndo|en cu[aá]nto)\b[^?]*\b(?:llego|llegar|alcanz\w+)\b[^?]*\b(independencia|independiente|libertad financiera|mi n[uú]mero)\b/i.test(t) ||
    /cu[aá]nto\s+(?:debo|tengo que|necesito|deber[ií]a|puedo)\b[^?]*\b(?:invertir|aportar|ahorrar)\b[^?]*\b(?:para|llegar|independencia|independiente|mi n[uú]mero|libertad)\b/i.test(t) ||
    /\b(?:c[oó]mo|plan|hoja de ruta)\b[^?]*\b(?:para\s+)?(?:mi\s+)?(?:independencia (?:financiera)?|libertad financiera)\b/i.test(t)
  ) {
    return { intent: "plan_independencia", params: {} };
  }

  // ── HISTORIAL / TENDENCIA (consulta_historial). Va ANTES de REASONING_CUES, que atrapa
  //    "cómo" y mandaría "¿cómo cambió mi patrimonio?" al LLM sin la serie. Y antes de
  //    resumen_inversiones/gasto_mes, que responderían la foto de HOY a una pregunta de EVOLUCIÓN.
  //    Exige señal de CAMBIO (cambió/evolución/tendencia/viene/vs el mes pasado) + un objeto
  //    reconocible; sin objeto claro no entra (la métrica no se adivina).
  {
    const senalCambio =
      /\bc[oó]mo\s+(?:cambi|viene|va\s+cambiando|evolucion|vengo)|\bevoluci[oó]n\b|\btendencia\b|\bhist[oó]rico\b|\bhistorial\b|\bmes\s+a\s+mes\b|\b(?:vs\.?|versus|comparado con)\s+(?:el\s+)?(?:mes|a[nñ]o)\s+(?:pasado|anterior)\b|\b(?:subi[oó]|baj[oó]|creci[oó]|mejor[oó]|empeor[oó])|\bc[oó]mo\s+vengo\b/i.test(t);
    if (senalCambio) {
      const metrica =
        /\bpatrimonio\b|\bnet\s*worth\b|\bvalor\s+neto\b/i.test(t) ? "patrimonio"
        : /\bportafolio\b|\bportfolio\b|\bcartera\b|\binversion(?:es)?\b/i.test(t) ? "portafolio"
        : /\bahorro\b|\bahorr\w+\b/i.test(t) ? "ahorro"
        : /\bingres\w+\b/i.test(t) ? "ingreso"
        : /\bgast\w+\b/i.test(t) ? "gasto"
        : null;
      if (metrica) {
        return { intent: "consulta_historial", params: { metrica, meses: 6 } };
      }
    }
  }

  // ── LIBRO DIARIO (consulta_transacciones). Va ANTES de REASONING_CUES —que atrapa "comparar"
  //    y "vs" y mandaría "¿gasté más este mes que el pasado?" al LLM sin datos— y antes de
  //    gasto_categoria/gasto_mes, que son golosos y responderían el agregado del mes en curso a
  //    una pregunta que pide OTRO periodo. Todos devuelven cifras reales del libro diario.

  // A) Picos por fecha: "¿qué días/fechas gasto más?", "¿en qué fechas gasto más?".
  if (
    /(?:qu[eé]|cu[aá]les|en qu[eé])\s+(?:d[ií]as?|fechas?)\b[^?]*\b(?:gast|compr|se me va|se va)/i.test(t) ||
    /\b(?:d[ií]as?|fechas?)\s+(?:que|en que|donde|en los que)\b[^?]*\bm[aá]s\s+gast/i.test(t)
  ) {
    return {
      intent: "consulta_transacciones",
      params: {
        periodo: extractPeriodo(t) ?? "ultimos_90_dias",
        tipo: "gasto",
        agrupacion: "dia",
        orden: "monto_desc",
        tope: 5,
      },
    };
  }

  // B) Comparación de dos periodos: "¿gasté más este mes que el pasado?", "este mes vs el pasado".
  if (
    /\b(?:este\s+mes|mes\s+actual)\b[^?]*\b(?:vs\.?|versus|contra|comparado con|que\s+(?:el\s+)?(?:mes\s+)?(?:pasado|anterior))\b/i.test(t) ||
    /\bgast[eé]\s+(?:m[aá]s|menos)\b[^?]*\b(?:este\s+mes|mes\s+pasado|mes\s+anterior)\b/i.test(t) ||
    /\bcompar\w+\b[^?]*\b(?:mes\s+pasado|mes\s+anterior|este\s+mes)\b/i.test(t)
  ) {
    return {
      intent: "consulta_transacciones",
      params: { periodo: "mes_y_anterior", tipo: "gasto", agrupacion: "mes", orden: "fecha_asc", tope: 2 },
    };
  }

  // C) "¿a quién/qué comercio le gasto más?" → ranking por comercio.
  if (
    /(?:a\s+qui[eé]n|qu[eé]\s+(?:comercio|negocio|tienda|lugar|local))\b[^?]*\b(?:m[aá]s\s+)?(?:le\s+)?gast/i.test(t) ||
    /\b(?:comercio|negocio|tienda)s?\b[^?]*\bdonde\s+m[aá]s\s+gast/i.test(t)
  ) {
    return {
      intent: "consulta_transacciones",
      params: {
        periodo: extractPeriodo(t) ?? "ultimos_90_dias",
        tipo: "gasto",
        agrupacion: "comercio",
        orden: "monto_desc",
        tope: 5,
      },
    };
  }

  // D) Gasto con un periodo EXPLÍCITO distinto del mes en curso, con o sin término
  //    ("¿cuánto gasté la semana pasada?", "¿en qué gasté esta semana?", "¿cuánto gasté en marzo?").
  //    Sin marcador temporal explícito NO entra acá: eso sigue siendo gasto_mes/gasto_categoria.
  {
    const periodo = extractPeriodo(t);
    // OJO con `\b` después de vocal acentuada: `é` no es carácter de palabra en JS, así que
    // `\bqu[eé]\b` NUNCA matchea "qué". Por eso acá no hay `\b` de cierre en esos grupos.
    const esConsultaGasto =
      /(?:\bcu[aá]nto|\bqu[eé]|\ben\s+qu[eé])[^?]*\b(?:gast[eéoó]|compr[eéoó]|pagu[eé]|se me fue|se fue|ingres[eéoó]|gan[eé]|cobr[eé]|recib[ií])/i.test(t) ||
      /\b(?:movimientos?|transacciones?|compras?)\b/i.test(t);
    if (periodo && esConsultaGasto) {
      // Sin `\b` de cierre tras `qu[eé]` (ver nota arriba: `é` no es carácter de palabra).
      const desglose = /\ben\s+qu[eé]|\bd[oó]nde\b|\bdesglos|\bdetalle\b|\bcategor|\bsobres?\b/i.test(t);
      return {
        intent: "consulta_transacciones",
        params: {
          periodo,
          tipo: /\bingres|\bgan[eé]|\bcobr[eé]|\brecib[ií]/i.test(t) ? "ingreso" : "gasto",
          agrupacion: desglose ? "categoria" : "ninguna",
          termino: extractTerminoGasto(t),
          tope: 10,
        },
      };
    }
  }

  // E) Gasto en un COMERCIO/sobre concreto, sin periodo ("¿cuánto le gasté a Walmart?").
  //    El término es el guard: sin él no entra (si no, se comería "¿cuánto gasté?" a secas).
  if (/\b(?:cu[aá]nto)\b[^?]*\b(?:le\s+)?(?:he\s+)?(?:gast[eé]\w*|pagu[eé]|compr[eé]\w*)\s+(?:en|a|con)\b/i.test(t)) {
    const termino = extractTerminoGasto(t);
    if (termino) {
      return {
        intent: "consulta_transacciones",
        params: {
          periodo: extractPeriodo(t) ?? "ultimos_180_dias",
          tipo: "gasto",
          agrupacion: "ninguna",
          termino,
          tope: 10,
        },
      };
    }
  }

  // "¿cómo van mis metas?" → progreso de metas. Va ANTES del guard de REASONING_CUES: la rama
  // de `metas` de abajo YA tenía el patrón "cómo va(n) mi(s) meta", pero era inalcanzable —
  // cualquier texto con "cómo" moría acá primero y una consulta puramente factual terminaba
  // escalando al modelo grande. El historial ("cómo vengo con el ahorro/gasto") ya corrió más
  // arriba y se queda con lo suyo.
  //
  // Ante duda seguimos escalando: si además de "cómo" hay señal de razonamiento —"¿cómo van
  // mis metas SI APORTO 50 mil más?", "¿cómo debería priorizar mis metas?"— este carril no
  // toca la pregunta y cae al guard de abajo.
  if (
    !REASONING_SIN_COMO.test(t) &&
    /c[oó]mo\s+(?:va|van|voy|vengo|vamos)\b[\s\S]{0,24}\bmetas?\b/i.test(t)
  ) {
    return { intent: "metas", params: {} };
  }

  if (REASONING_CUES.test(t)) return null; // consejo/proyección → razonamiento

  // "¿me puedo comprar / me alcanza para X?" en CUALQUIER orden (verbo+ítem o señal suelta + ítem).
  // El `desc` (ítem de compra) es el guard: sin ítem no rutea (evita "me alcanza el tiempo…").
  if (AFFORD_VERB_RE.test(t) || AFFORD_LOOSE_RE.test(t)) {
    const desc = extractAffordDesc(t);
    if (desc) return { intent: "puedo_gastar", params: { desc, amount: extractAmount(t) } };
  }

  // Los TRES números patrimoniales — distinguidos explícitamente (no se mezclan).
  if (/n[uú]mero de seguridad|cu[aá]nto necesito para (?:cubrir )?(?:lo esencial|mis? gastos? esenciales?)/i.test(t)) {
    return { intent: "numero_seguridad", params: {} };
  }
  if (/n[uú]mero de independencia|cu[aá]nto necesito para (?:sostener|cubrir) mi vida (?:actual)?/i.test(t)) {
    return { intent: "numero_independencia", params: {} };
  }
  if (/n[uú]mero de libertad|cu[aá]nto necesito para (?:ser libre|mi libertad|mi estilo de vida)/i.test(t)) {
    return { intent: "numero_libertad", params: {} };
  }
  // "cuáles metas debo aportar este mes / qué metas toca aportar / aportes pendientes de metas":
  // metas de AHORRO recurrentes a las que toca apartar su aporte — NO enumerar todos los sobres.
  // ANTES de listar_sobres/metas (que confundían "cuáles … metas" con "listá todo"). El consejo
  // ("¿debería aportar más?") ya se fue por REASONING_CUES arriba; acá solo la consulta factual.
  if (/\bmetas?\b/i.test(t) && (/\bapor\w+/i.test(t) || /\bpendientes?\b/i.test(t))) {
    return { intent: "metas_a_aportar", params: {} };
  }
  // Mejora 3 — "listá mis sobres/frascos/metas": enumeración agrupada por frasco (determinista).
  // Antes que `metas` (progreso): "sobres"/"frascos" son inequívocos; "cuáles/listá … metas" también.
  // La rama de METAS NO matchea si hay señal de aporte/período (eso es metas_a_aportar, no "listá todo").
  const METAS_APORTE_CUE = /\bapor\w+|\bdebo\b|\btoca\b|\beste mes\b|\bpendientes?\b/i;
  if (
    /\b(?:sobres|frascos)\b/i.test(t) ||
    (/(?:cu[aá]les|list[aá]|mostr[aá]|ver|dame|enumer\w*)\s+(?:son\s+)?(?:todas?\s+)?(?:mis\s+)?metas\b/i.test(t) &&
      !METAS_APORTE_CUE.test(t))
  ) {
    return { intent: "listar_sobres", params: {} };
  }
  if (/progreso de (?:mi\s+)?ahorro|c[oó]mo va(?:n)? (?:mi|mis) (?:meta|ahorro)|cu[aá]nto llevo (?:ahorrado|en mis metas)|(?:mis)\s+metas\b/i.test(t)) {
    return { intent: "metas", params: {} };
  }
  if (/(?:cu[oó]ta|pago mensual|cu[aá]nto pago|pago m[ií]nimo)\b/i.test(t)) {
    return { intent: "cuota_deuda", params: { debtName: extractDebtName(t) } };
  }
  // R2 — gasto por categoría / dominante ("¿en qué gasto más?"). Antes que gasto_mes (más específico).
  // Gasto dominante / sobre más caro. Incluye slang ya normalizado ("en qué se me va el dinero") y el
  // sinónimo "sobre más caro" (= sobre de mayor gasto). "dónde se va" / "en qué se me va".
  if (
    /en qu[eé] (?:gasto|gast[eé])|(?:categor[ií]a|rubro).*(?:m[aá]s gasto|gasto)|(?:mayor|m[aá]s alto|principal) gasto|sobre (?:m[aá]s caro|de mayor gasto)|d[oó]nde se (?:me\s+)?(?:va|van)\s+(?:mis?|el|la|los|las)\b|en qu[eé] se (?:me )?va\b/i.test(t)
  ) {
    return { intent: "gasto_categoria", params: {} };
  }
  if (/(?:cu[aá]nto|qu[eé])\s+(?:gast[eéoó]|llevo gastado)|(?:mi|el)\s+gasto (?:del mes|mensual|este mes)|gast[eé] (?:este mes|en el mes)/i.test(t)) {
    return { intent: "gasto_mes", params: {} };
  }
  if (/(?:cu[aá]nto|qu[eé])\s+(?:gan[eéoó]|ingres[eéoó])|(?:mis|el|los)\s+ingresos?\b|cu[aá]nto (?:me )?(?:entr[oó]|cae|llega|cae al mes)/i.test(t)) {
    return { intent: "ingreso_mes", params: {} };
  }
  // Flujo libre ("¿cuánto tengo libre pa gastar?", "¿cuánto me sobra?", "¿cuál es mi flujo libre?") →
  // ctx.freeCashflow, NO el saldo de liquidez (que devolvía ₡0). Antes de saldo_sobre/saldo_liquidez.
  if (
    /\bflujo\s+libre\b|cu[aá]nto\s+(?:me\s+)?(?:queda|tengo|hay)\s+libre\b|\blibre\s+(?:pa'?|para)\s+gastar\b|cu[aá]nto\s+(?:me\s+)?sobra\b/i.test(t)
  ) {
    return { intent: "flujo_libre", params: {} };
  }
  // Restante de SOBRE(s): "cuánto me queda en/de {sobre}" con un nombre de sobre (NO liquidez). ANTES
  // de saldo_liquidez, que era demasiado goloso ("cuánto me queda" caía en liquidez y daba ₡0).
  const sobreNames = extractSobreNames(t);
  if (sobreNames.length > 0) {
    return { intent: "saldo_sobre", params: { names: sobreNames, multiPart: isMultiPart(t) } };
  }
  // Liquidez SOLO ante términos explícitos (líquido/efectivo/disponible/en cuentas/saldo), no un
  // "cuánto me queda de {algo}" (eso ya lo tomó saldo_sobre). Bare/ambiguo → cae al LLM (no ₡0 malo).
  if (/(?:mi\s+)?(?:saldo|liquidez|dinero l[ií]quido|efectivo)\b|\bl[ií]quido\b|\ben (?:mis |la |las )?cuentas?\b|cu[aá]nto (?:tengo|me queda|hay) (?:disponible|l[ií]quido|en (?:la |las |mis )?cuentas?|en efectivo|en el banco)\b/i.test(t)) {
    return { intent: "saldo_liquidez", params: {} };
  }
  if (/(?:[uú]ltim[oa]s?|recientes?)\s+(?:movimiento|transacci|gasto|compra)|(?:mis|los)\s+(?:movimientos|transacciones)\b|qu[eé] (?:gast[eé]|compr[eé]) (?:hoy|ayer|[uú]ltim)/i.test(t)) {
    return { intent: "ultimos_movimientos", params: {} };
  }
  return null;
}

/** Clasificador Flash-Lite (solo cuando el patrón NO matchea). Barato. Devuelve null si no
 *  está seguro (intent desconocido/complejo/parseo fallido) → escalar al razonamiento. */
async function classifyWithLite(
  text: string,
): Promise<{ intent: Intent; params: Record<string, unknown>; tokensIn: number; tokensOut: number } | null> {
  const lite = createGeminiProvider(LITE_MODEL);
  if (!lite) return null;
  const system =
    "Clasificás preguntas de finanzas personales. Devolvé SOLO JSON " +
    '{"intent": "numero_seguridad"|"numero_independencia"|"numero_libertad"|"metas"|"metas_a_aportar"|"meta_cercana"|"defensa_fondo"|"ahorro_mensual"|"resumen_inversiones"|"dca_mensual"|"cuota_deuda"|"gasto_mes"|"ingreso_mes"|"gasto_categoria"|"flujo_libre"|"saldo_liquidez"|"ultimos_movimientos"|"listar_sobres"|"otro", "complejo": true|false}. ' +
    "numero_seguridad=capital para sus gastos esenciales; numero_independencia=capital para su vida actual; " +
    "numero_libertad=capital para su estilo de vida deseado (NO son lo mismo; no los mezcles). " +
    "gasto_mes=cuánto gasta al mes; ingreso_mes=cuánto gana; gasto_categoria=en qué gasta más; " +
    "flujo_libre=cuánto le queda LIBRE para gastar al mes / cuánto le sobra (ingreso menos compromisos); " +
    "saldo_liquidez=cuánto tiene disponible AHORA en cuentas/efectivo (distinto de flujo_libre); " +
    "ultimos_movimientos=sus transacciones recientes; " +
    "listar_sobres=enumerar sus sobres/frascos/metas (no su progreso). metas=el progreso de sus metas. " +
    "metas_a_aportar=a cuáles metas de ahorro RECURRENTES le toca aportar este mes (con su monto); NO son los sobres de gasto. " +
    "meta_cercana=cuál meta está más cerca de completarse. defensa_fondo=estado de su fondo de emergencia/paz o meses de colchón. " +
    "ahorro_mensual=cuánto ahorra al mes (aportes a metas). resumen_inversiones=cuánto tiene invertido / cómo va el portafolio / ganancia. " +
    "dca_mensual=cuánto aporta de DCA al mes. " +
    '"complejo": true si pide análisis, proyección, consejo, comparación o cualquier cosa más allá de consultar un dato simple. Ante duda: "otro" o complejo:true.';
  try {
    const r = await lite.chat({ system, messages: [{ role: "user", content: text }], maxTokens: 40 });
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { intent?: string; complejo?: boolean };
    const intent = parsed.intent as Intent;
    if (parsed.complejo || !KNOWN_INTENTS.includes(intent)) return null; // ante duda, escalá
    const params = intent === "cuota_deuda" ? { debtName: extractDebtName(text) } : {};
    return { intent, params, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch {
    return null; // sin clasificación segura → razonamiento
  }
}

const pct = (cur: number, tgt: number) => (tgt > 0 ? Math.round((cur / tgt) * 100) : 0);

/**
 * CARRIL DE CONSULTA: responde el intent con la cifra del ToolContext (motor determinista) vía
 * plantilla (0 tokens). Devuelve null si el contexto no alcanza → escalar (no adivinar).
 */
export function answerFromContext(
  intent: Intent,
  params: Record<string, unknown>,
  tc: ToolContext,
  ctx?: FinancialContext,
): AIChatResponse | null {
  const cur = tc.currency;
  const money = (n: number) => formatMoney(n, cur);
  // Las consultas de dato nunca PROPONEN una acción (solo informan) → action: null.
  const say = (reply: string): AIChatResponse => ({ reply, action: null });

  // R2 — cifras que YA vienen en el FinancialContext (0 fetch, ambos canales). Si el dato
  // best-effort no está → null (escala; no adivina).
  if (intent === "gasto_mes") {
    // Fuente REAL: el gasto de los SOBRES (compromisoDesglose.sobres, ya convertido a ctx.currency
    // por el motor y trazable a la misma fuente que compromiso/Independencia). expenseMonthly (lista
    // base) suele venir en 0 → no lo usamos como primaria. Nunca ₡0 si hay sobres.
    const sobres = ctx?.compromisoDesglose?.sobres;
    if (typeof sobres === "number" && sobres > 0) {
      return say(`Tu gasto mensual en sobres ronda ${money(sobres)}.`);
    }
    if (typeof ctx?.expenseMonthly === "number" && ctx.expenseMonthly > 0) {
      return say(`Tu gasto mensual ronda ${money(ctx.expenseMonthly)}.`);
    }
    return null; // sin dato real → escala (no inventamos ni decimos 0)
  }
  if (intent === "ingreso_mes") {
    if (typeof ctx?.incomeMonthly !== "number") return null;
    return say(`Tus ingresos mensuales son ${money(ctx.incomeMonthly)}.`);
  }
  if (intent === "flujo_libre") {
    // Flujo libre = ingreso − compromisos (ya calculado por el motor). NUNCA es el saldo de liquidez.
    const f = ctx?.freeCashflow;
    if (typeof f !== "number") return null; // sin dato → escala (no adivina)
    if (f <= 0) {
      return say("Este mes no te queda flujo libre: tus compromisos ya igualan o superan tu ingreso. Si querés, revisamos los sobres para liberar margen.");
    }
    return say(`Te queda ~${money(f)} libre este mes, después de tus compromisos (ingresos menos gastos y aportes).`);
  }
  if (intent === "gasto_categoria") {
    // Sobre de MAYOR gasto (presupuesto YA convertido por el motor a ctx.currency). Determinista.
    const sobre = ctx?.topGastoSobre;
    if (sobre) {
      return say(`Tu sobre de mayor gasto es ${sobre.name}: ${money(sobre.monthly)} al mes.`);
    }
    const top = ctx?.topExpenseCategory;
    if (!top) return null;
    return say(`Donde más gastás es ${top.name}: ${money(top.monthly)} al mes (${top.pct}% de tu gasto).`);
  }

  // Los TRES números patrimoniales. Cada cifra sale del motor (patrimonio-engine, al 8% anual);
  // JAMÁS se inventa ni se usa la regla del 4%/25×. "have" = patrimonio invertible.
  if (
    intent === "numero_seguridad" ||
    intent === "numero_independencia" ||
    intent === "numero_libertad"
  ) {
    const have = typeof tc.investableWealth === "number" ? tc.investableWealth : 0;
    const progreso = (target: number): string => {
      const falta = Math.max(0, target - have);
      return have > 0
        ? ` Hoy llevás ${money(have)} invertibles${falta > 0 ? `, te faltan ${money(falta)}.` : " — ¡ya lo alcanzaste!"}`
        : " Todavía no registrás patrimonio invertible.";
    };

    if (intent === "numero_seguridad") {
      const n = tc.securityNumber;
      if (typeof n !== "number" || n <= 0) return null;
      return say(
        `Tu Número de Seguridad es ${money(n)} — el capital que, al 8% anual, cubre tus gastos ESENCIALES.` +
          progreso(n),
      );
    }
    if (intent === "numero_independencia") {
      const n = tc.independenceNumber;
      if (typeof n !== "number" || n <= 0) return null;
      return say(
        `Tu Número de Independencia es ${money(n)} — el capital que, al 8% anual, cubre tus gastos TOTALES actuales.` +
          progreso(n),
      );
    }
    // numero_libertad: estilo de vida DESEADO. Si NO lo definió, NO respondas solo "no lo tengo":
    // el usuario suele decir "libertad" por su vida ACTUAL → dale el Número de Independencia + una
    // oferta de UNA línea para definir Libertad como un objetivo mayor.
    const n = tc.libertyNumber;
    if (typeof n !== "number" || n <= 0) {
      const indep = tc.independenceNumber;
      if (typeof indep === "number" && indep > 0) {
        return say(
          `Todavía no definiste un estilo de vida DESEADO aparte, así que tu número hoy es el de INDEPENDENCIA: ${money(indep)} — el capital que, al 8% anual, cubre tu vida actual.` +
            progreso(indep) +
            ` Si querés, definimos tu Número de Libertad como un objetivo mayor (tu estilo de vida deseado). ¿Lo hacemos?`,
        );
      }
      return say(
        "Todavía no tengo tu Número de Libertad ni el de Independencia. Registrá tu compromiso mensual (gastos + metas + inversión) y te los calculo — no los invento.",
      );
    }
    return say(
      `Tu Número de Libertad es ${money(n)} — el capital que, al 8% anual, sostiene el estilo de vida que DESEÁS.` +
        progreso(n),
    );
  }

  // PLAN de independencia: proyección determinista hacia el Número de INDEPENDENCIA (ya calculado),
  // SIN pedir estilo de vida deseado. Meta = independencia; capital inicial = invertible; aporte =
  // flujo libre; al 8%. Respuesta corta con la cifra real (ver ejemplo del producto).
  if (intent === "plan_independencia") {
    const target = tc.independenceNumber;
    if (typeof target !== "number" || target <= 0) return null; // sin número → escala
    const have = typeof tc.investableWealth === "number" ? tc.investableWealth : 0;
    const aporte = typeof ctx?.freeCashflow === "number" ? ctx.freeCashflow : 0;
    const compromiso = typeof ctx?.compromisoMensual === "number" ? ctx.compromisoMensual : null;
    const cubre = compromiso ? ` (cubre tus ${money(compromiso)}/mes)` : "";
    if (have >= target) {
      return say(
        `Tu número de independencia es ${money(target)}${cubre}. Con ${money(have)} invertibles ya lo cubrís — ¡ya sos financieramente independiente! ¿Definimos tu número de Libertad, un objetivo mayor?`,
      );
    }
    if (aporte <= 0) {
      return say(
        `Tu número de independencia es ${money(target)}${cubre}. Hoy llevás ${money(have)} invertibles. Decime cuánto podés aportar al mes y te digo en ~cuántos años llegás (al 8%).`,
      );
    }
    const proj = projectInvestment(
      { aporte_mensual: aporte, rendimiento_anual_pct: 8, monto_inicial: have, objetivo: target },
      cur,
    );
    const meses = proj.meses_para_objetivo;
    if (meses == null) return null; // (no debería con aporte>0; ante duda, escala)
    const anios = Math.max(0.1, Math.round((meses / 12) * 10) / 10);
    return say(
      `Tu número de independencia es ${money(target)}${cubre}. Con tu patrimonio invertible ${money(have)} aportando ${money(aporte)}/mes al 8%, llegás en ~${anios} años. ¿Ajustamos el aporte?`,
    );
  }

  // "cuáles metas debo aportar este mes": SOLO metas de ahorro RECURRENTES (recurrence != 'ninguna')
  // con aporte mensual > 0, cada una con su monto a apartar + el total. NADA de sobres de gasto:
  // "metas" = savings_goals (tab Ahorro). El aporte_mensual ES el monto mensual (prorrateado) para
  // todas las cadencias; en no-mensuales se aclara que es el apartado de cada mes hacia el período.
  if (intent === "metas_a_aportar") {
    const recurring = (tc.goals ?? []).filter(
      (g) => g.recurrence != null && g.recurrence !== "ninguna" && (g.aporte_mensual ?? 0) > 0,
    );
    if (recurring.length === 0) {
      return say(
        "No tenés metas de ahorro recurrentes con aporte mensual configurado. (Son las metas del tab Ahorro, no los sobres de gasto.) Creá una con su recurrencia y aporte, y te digo cuánto apartar cada mes.",
      );
    }
    const lines = recurring.slice(0, 8).map((g) => {
      const nota =
        g.recurrence === "mensual" ? "" : ` · ${g.recurrence}: es tu apartado mensual hacia el aporte del período`;
      return `• ${g.nombre}: ${money(g.aporte_mensual)}${nota}`;
    });
    const total = recurring.reduce((s, g) => s + (g.aporte_mensual ?? 0), 0);
    return say(
      `Este mes te toca apartar en ${recurring.length} ${recurring.length === 1 ? "meta de ahorro" : "metas de ahorro"}:\n${lines.join("\n")}\nTotal a apartar: ${money(total)}.`,
    );
  }

  if (intent === "metas") {
    const goals = (tc.goals ?? []).filter((g) => (g.objetivo ?? 0) > 0);
    if (goals.length === 0) return say("Todavía no tenés metas de ahorro con objetivo registradas.");
    const lines = goals
      .slice(0, 6)
      .map((g) => `• ${g.nombre}: ${money(g.actual)} de ${money(g.objetivo)} (${pct(g.actual, g.objetivo)}%)`);
    return say(`Tenés ${goals.length} ${goals.length === 1 ? "meta" : "metas"}:\n${lines.join("\n")}`);
  }

  // DEFENSA — estado REAL de los fondos (ctx.defenseFunds del fund-sizing) o meses de colchón.
  if (intent === "defensa_fondo") {
    const focus = params.focus === "paz" ? "paz" : params.focus === "colchon" ? "colchon" : "emergencia";
    if (focus === "colchon") {
      const m = ctx?.mesesDeColchon;
      if (typeof m !== "number") return null;
      return say(
        `Tenés ~${m} ${m === 1 ? "mes" : "meses"} de colchón (tu liquidez ÷ tu gasto mensual). Si perdés el ingreso, es lo que aguantás cubriendo tu gasto actual.`,
      );
    }
    const df = ctx?.defenseFunds;
    if (!df) {
      const m = ctx?.mesesDeColchon;
      if (typeof m === "number")
        return say(`Todavía no tengo tus fondos de defensa registrados, pero tenés ~${m} ${m === 1 ? "mes" : "meses"} de colchón (liquidez ÷ gasto).`);
      return null; // sin dato → escala
    }
    const f = focus === "paz" ? df.paz : df.emergency;
    const label = focus === "paz" ? "de paz" : "de emergencia";
    const m2 = (n: number) => formatMoney(n, df.currency);
    if (!f.registrado) {
      return say(`Todavía no tenés registrado tu fondo ${label}. El objetivo sugerido es ${m2(f.objetivo)}; si querés lo creamos y te digo cuánto apartar al mes.`);
    }
    if (f.cubierto) {
      return say(`Tu fondo ${label} está COMPLETO: ${m2(f.actual)} de ${m2(f.objetivo)} (100%). ¡Blindado por ese lado!`);
    }
    const falta = Math.max(0, f.objetivo - f.actual);
    return say(
      `Tu fondo ${label} va en ${m2(f.actual)} de ${m2(f.objetivo)} (${f.progresoPct}%); te faltan ${m2(falta)}. Aporte sugerido: ${m2(f.aporteRecomendado)}/mes.`,
    );
  }

  // AHORRO mensual = suma de aportes a metas (compromisoDesglose.metas).
  if (intent === "ahorro_mensual") {
    const metas = ctx?.compromisoDesglose?.metas;
    if (typeof metas !== "number" || metas <= 0) return null; // sin dato → escala
    return say(`Aportás ~${money(metas)} al mes a tus metas de ahorro.`);
  }

  // INVERSIONES — resumen: invertido, valor actual y ganancia/pérdida. Cada cifra va con SU moneda
  // (los activos cotizados se leen en USD aunque la app esté en colones): son SUBTOTALES por moneda,
  // nunca un total que sume monedas distintas. El total convertido solo si el contexto lo trae.
  if (intent === "resumen_inversiones") {
    const inv = ctx?.investmentInvested ?? [];
    const val = ctx?.investmentValue ?? [];
    const pl = ctx?.investmentPL ?? [];
    if (val.length === 0 && inv.length === 0) return null;
    const subs = (ms: { monto: number; moneda: string }[]) =>
      ms.map((m) => formatMoney(m.monto, m.moneda)).join(" + ");
    const parts: string[] = [];
    if (val.length) parts.push(`Tu portafolio vale ${subs(val)}`);
    if (inv.length) parts.push(`invertiste ${subs(inv)}`);
    if (pl.length) {
      const detalle = pl
        .map((m) => `${m.monto >= 0 ? "+" : "−"}${formatMoney(Math.abs(m.monto), m.moneda)}`)
        .join(" ");
      parts.push(`tu resultado sobre lo invertido es ${detalle}`);
    }
    const conv = ctx?.portfolioValueConvertido;
    const extra =
      conv && val.length > 1 ? ` En ${conv.moneda}, el valor total equivale a ${formatMoney(conv.monto, conv.moneda)}.` : "";
    return say(parts.join("; ") + "." + extra);
  }

  // DCA mensual (aporte recurrente): compromisoDesglose.dca.
  if (intent === "dca_mensual") {
    const dca = ctx?.compromisoDesglose?.dca;
    if (typeof dca !== "number" || dca <= 0) return null; // sin dato → escala
    return say(`Tu aporte recurrente (DCA) es ~${money(dca)} al mes.`);
  }

  // "¿Cuánto me falta pa {meta}?" — brecha de una meta por nombre (tc.goals).
  if (intent === "falta_meta") {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
    const name = typeof params.metaName === "string" ? norm(params.metaName) : "";
    const goals = (tc.goals ?? []).filter((g) => (g.objetivo ?? 0) > 0);
    const g = name ? goals.find((x) => norm(x.nombre).includes(name) || name.includes(norm(x.nombre))) : null;
    if (!g) return null; // sin meta que matchee → escala (no adivina)
    const falta = Math.max(0, g.objetivo - g.actual);
    if (falta <= 0) return say(`Tu meta ${g.nombre} ya está completa: ${money(g.actual)} de ${money(g.objetivo)}. ¡Listo!`);
    return say(`Para ${g.nombre} te faltan ${money(falta)} (llevás ${money(g.actual)} de ${money(g.objetivo)}, ${pct(g.actual, g.objetivo)}%).`);
  }

  // Meta más cercana a completarse (mayor % de progreso, aún en curso).
  if (intent === "meta_cercana") {
    const goals = (tc.goals ?? []).filter((g) => (g.objetivo ?? 0) > 0 && g.actual < g.objetivo);
    if (goals.length === 0) return say("No tenés metas de ahorro en curso ahora mismo.");
    const closest = goals.reduce((a, b) => (pct(b.actual, b.objetivo) > pct(a.actual, a.objetivo) ? b : a));
    const falta = Math.max(0, closest.objetivo - closest.actual);
    return say(
      `Tu meta más cercana a completarse es ${closest.nombre}: ${pct(closest.actual, closest.objetivo)}% (${money(closest.actual)} de ${money(closest.objetivo)}), te faltan ${money(falta)}.`,
    );
  }

  if (intent === "cuota_deuda") {
    const debts = tc.debts ?? [];
    if (debts.length === 0) return say("No tenés deudas registradas.");
    const name = typeof params.debtName === "string" ? params.debtName.toLowerCase() : null;
    const match = name ? debts.find((d) => d.name.toLowerCase().includes(name)) : null;
    const debt = match ?? (debts.length === 1 ? debts[0] : null);
    // tc.debts YA viene normalizado a `cur` por normalizeDebtsForTool, así que formatear con `cur`
    // es correcto. Lo que NO es correcto es callar cuando la normalización no pudo convertir: ahí
    // las cifras asumen una sola moneda. La moneda nativa no se puede recuperar del dato
    // normalizado, así que se avisa en vez de inventarla.
    const asumeUnaMoneda = tc.fxUnavailable
      ? " Ojo: no pude obtener el tipo de cambio, así que esta cifra asume que todas tus deudas están en una sola moneda."
      : "";
    if (!debt) {
      // Varias deudas y no se identificó cuál → listar (sin adivinar).
      const list = debts.slice(0, 6).map((d) => `• ${d.name}: ${money(d.minPayment)}/mes`).join("\n");
      return say(`Tenés varias deudas. Sus cuotas mensuales:\n${list}${asumeUnaMoneda}`);
    }
    const apr = debt.apr > 0 ? ` (APR ${debt.apr}%)` : "";
    return say(`La cuota mensual de ${debt.name} es ${money(debt.minPayment)}${apr}.${asumeUnaMoneda}`);
  }

  return null;
}

/**
 * Resuelve los intents R2 que requieren LECTURA fresca (no están en ctx). Import dinámico para
 * no acoplar la DB al camino puro de patrones/plantillas. Session-based (`requireUser`): en web
 * funciona; en WhatsApp (service-role, sin sesión) el fetch lanza → se captura → null → escala.
 * Devuelve la cifra REAL del ledger; jamás inventa.
 */
async function resolveFetchIntent(
  intent: Intent,
  cur: string,
  params: Record<string, unknown> = {},
): Promise<AIChatResponse | null> {
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  try {
    // "¿me puedo comprar X?": mapea al sobre (DETERMINISTA primero, LLM con timeout) y responde con
    // el restante del MOTOR. Este carril NUNCA escala ni se cuelga en Gemini → nunca IA-503.
    if (intent === "puedo_gastar") {
      const desc = typeof params.desc === "string" ? params.desc : "";
      if (!desc) return null; // sin ítem (no debería pasar: matchIntent exige desc)
      const amt =
        params.amount && typeof params.amount === "object"
          ? (params.amount as { monto: number; moneda: string | null })
          : null;
      const { suggestSobreForChatFast, getSobreRemaining } = await import("@/modules/financial-base");
      const sug = await suggestSobreForChatFast(desc, "gasto");
      if (!sug.categoryId) {
        // Sin sobre claro → pedir precisión (determinista), NO escalar al LLM.
        return say(
          `No estoy seguro a qué sobre cargar «${desc}». ¿A cuál lo llevo — Restaurantes, Salidas…? Decímelo y te digo cuánto te queda.`,
        );
      }
      const rem = await getSobreRemaining(sug.categoryId, await userToday());
      if (!rem) {
        return say(
          `Encontré ${sug.categoryPath ?? "tu sobre"} pero no pude leer su presupuesto ahora. Probá de nuevo en un momento.`,
        );
      }
      // El monto se compara en la MONEDA DEL SOBRE (rem.currency = visualización). Si el usuario dio
      // otra ("₡8.000" con display USD), se CONVIERTE antes de comparar — nunca ₡8.000 tratado como $8.000.
      let amount: number | null = null;
      if (amt) {
        if (!amt.moneda || amt.moneda === rem.currency) amount = amt.monto;
        else {
          try {
            const { getFxRates } = await import("@/lib/market-data/fx-rates");
            const { convertCurrency } = await import("@/lib/fx");
            amount = Math.round(convertCurrency(amt.monto, amt.moneda, rem.currency, await getFxRates()));
          } catch {
            amount = amt.monto; // sin FX: usa el crudo (mejor que descartar la pregunta)
          }
        }
      }
      const path = sug.categoryPath ?? rem.path;
      return say(affordReply(path, rem, amount, (n) => formatMoney(n, rem.currency)));
    }
    // "cuánto me queda en/de {sobre(s)}": restante por sobre (getSobreRemaining, reusa el mapeo de
    // puedo_gastar). Soporta VARIOS. Multi-parte → null (escala; nunca una respuesta enlatada mala).
    if (intent === "saldo_sobre") {
      if (params.multiPart === true) return null;
      const names = Array.isArray(params.names) ? (params.names as string[]) : [];
      if (names.length === 0) return null;
      const { listSobresForKind, suggestSobreForChatFast, getSobreRemaining } = await import("@/modules/financial-base");
      const today = await userToday();
      // El usuario NOMBRA el sobre → match por NOMBRE contra sus sobres reales (no el clasificador
      // comercio→sobre de puedo_gastar, que es para "¿me alcanza para X?"). Fallback: el clasificador.
      const sobres = await listSobresForKind("gasto").catch(() => [] as { id: string; sobre: string; frasco: string | null }[]);
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
      const byName = (name: string) => {
        const n = norm(name);
        const hit = sobres.find((s) => {
          const so = norm(s.sobre);
          return so === n || so.includes(n) || n.includes(so);
        });
        return hit ? { id: hit.id, path: hit.frasco ? `${hit.frasco} › ${hit.sobre}` : hit.sobre } : null;
      };
      const parts: string[] = [];
      for (const name of names) {
        let hit = byName(name);
        if (!hit) {
          const sug = await suggestSobreForChatFast(name, "gasto"); // fallback: clasificador
          if (sug.categoryId) hit = { id: sug.categoryId, path: sug.categoryPath ?? name };
        }
        if (!hit) {
          parts.push(`no tenés un sobre de «${name}»`);
          continue;
        }
        const rem = await getSobreRemaining(hit.id, today);
        const path = hit.path || rem?.path || name;
        const money = (n: number) => formatMoney(n, rem?.currency ?? cur);
        if (!rem || !rem.hasBudget) parts.push(`en ${path} no tenés presupuesto asignado`);
        else if (rem.remaining <= 0) parts.push(`en ${path} ya te pasaste (gastaste ${money(rem.spent)} de ${money(rem.budget)})`);
        else parts.push(`en ${path} te quedan ${money(rem.remaining)} de ${money(rem.budget)}`);
      }
      if (parts.length === 0) return null;
      const joined = parts.join("; ");
      return say(`${joined.charAt(0).toUpperCase()}${joined.slice(1)} este mes.`);
    }
    if (intent === "saldo_liquidez") {
      const { getLiquidityBalance } = await import("@/modules/financial-base");
      const { balance } = await getLiquidityBalance();
      return say(`Tu saldo de liquidez actual es ${formatMoney(balance, cur)}.`);
    }
    if (intent === "listar_sobres") {
      const { getEnvelopesSummary, formatEnvelopesReply } = await import("@/modules/financial-base");
      // Estructura AGRUPADA POR FRASCO (gasto y acumulables por separado) → Markdown determinista.
      // 0 tokens, exacto, sin alucinar (el cliente lo pasa por renderMarkdown → HTML seguro).
      return say(formatEnvelopesReply(await getEnvelopesSummary()));
    }
    if (intent === "consulta_detalle") {
      // Detalle fino por dominio (0 tokens). Un nombre que no resuelve dice cuáles SÍ existen;
      // un dominio vacío lo dice. Nunca "no tengo acceso".
      const { consultarDetalle } = await import("@/lib/ai/detail-query-service");
      const r = await consultarDetalle(params, cur);
      return say(r.resumen_md);
    }
    if (intent === "consulta_historial") {
      // Serie histórica REAL desde los snapshots (0 tokens, plantilla determinista). Sin
      // historia suficiente responde "todavía no tengo historial…", nunca "no tengo acceso".
      const { consultarHistorial } = await import("@/lib/ai/history-query-service");
      const r = await consultarHistorial(params, cur);
      return say(r.resumen_md);
    }
    if (intent === "consulta_transacciones") {
      // Libro diario REAL: el servicio resuelve el periodo en la zona del PERFIL, lee con scope
      // de hogar y el motor puro agrega. `resumen_md` ya viene renderizado (0 tokens). Un periodo
      // sin movimientos responde "no tenés movimientos en ese periodo" — nunca "no tengo acceso".
      const { consultarTransacciones } = await import("@/lib/ai/transactions-query-service");
      const r = await consultarTransacciones(params, cur);
      return say(r.resumen_md);
    }
    if (intent === "ultimos_movimientos") {
      const { listTransactions } = await import("@/modules/financial-base");
      // Ventana de 60 días para no depender del día del mes; las 5 más recientes.
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      const fromD = new Date(now);
      fromD.setDate(fromD.getDate() - 60);
      const from = fromD.toISOString().slice(0, 10);
      const period = { month: now.getMonth() + 1, year: now.getFullYear(), from, to, label: "" };
      const txns = await listTransactions(period, {}, 5);
      if (txns.length === 0) return say("No registrás movimientos en los últimos 60 días.");
      const lines = txns.map((t) => {
        const label = t.merchantOrSource ?? t.description ?? "Movimiento";
        const sign = t.kind === "ingreso" ? "+" : "−";
        return `• ${t.occurredOn} · ${label}: ${sign}${formatMoney(t.amount, t.currency)}`;
      });
      return say(`Tus últimos movimientos:\n${lines.join("\n")}`);
    }
  } catch {
    return null; // sin sesión / lectura fallida → escala al razonamiento
  }
  return null;
}

/** asset_type del holding → tipo de mercado de getMarketHighlights. */
const MARKET_TYPE: Record<string, "stock" | "etf" | "crypto"> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/**
 * Carril DETERMINISTA de datos de mercado: resuelve el símbolo contra las posiciones del usuario
 * (ctx.holdings), llama al tool (getMarketHighlights, cacheado) y arma la respuesta con
 * computeMarketScenario (cifra real) — NO depende de que el LLM decida llamar el tool. Fallo honesto:
 * si no hay símbolo o el dato vuelve null, dice el motivo real (nunca "no tengo acceso").
 */
/**
 * Lee la posición COMPLETA del usuario en un símbolo (cantidad + invertido + moneda), de las
 * holdings completas con scope de hogar — NO del top-N compacto. Best-effort: sin sesión (WhatsApp)
 * o ante cualquier fallo → null (el carril sigue sin la posición). Import dinámico (server-only).
 */
async function getFullPosition(
  symbol: string,
): Promise<{ quantity: number; invested: number; currency: string; assetType: string } | null> {
  try {
    const { getPositionForSymbol } = await import("@/modules/wealth");
    return await getPositionForSymbol(symbol);
  } catch {
    return null;
  }
}

/** Convierte lo invertido a la moneda del escenario. Ante fallo del FX devuelve NULL (no el original):
 *  dejar el monto en su moneda de origen con la etiqueta de otra (CRC como $) es el bug de moneda
 *  mezclada. El caller, ante null, OMITE lo invertido/ganancia y deja el resto en una sola moneda. */
async function convertInvested(amount: number, from: string, to: string): Promise<number | null> {
  try {
    const { getFxRates } = await import("@/lib/market-data/fx-rates");
    const { convertCurrency } = await import("@/lib/fx");
    const rates = await getFxRates();
    const out = Math.round(convertCurrency(amount, from, to, rates));
    return Number.isFinite(out) && out >= 0 ? out : null;
  } catch {
    return null;
  }
}

const SCOPE_LABEL: Record<ScopeKind, string> = {
  altcoins: "tus altcoins",
  crypto: "toda tu cripto",
  all: "todas tus inversiones",
};

/**
 * Carril MULTI-POSICIÓN determinista: "vender todos mis altcoins a 90% de su ATH, ¿cuánto generan?".
 * Itera los holdings del alcance, lee precio/ATH del STORE por cada uno (getMarketHighlights =
 * store-first, sin enjambre en vivo), computa por posición y SUMA (desglose por moneda). Una
 * posición sin el dato necesario NO bloquea el total. SIEMPRE responde algo. null si no hay alcance
 * múltiple (→ carril de una posición). El invertido de ctx.holdings está en moneda PRINCIPAL: se
 * convierte a la moneda del escenario (la del ATH/precio) por posición.
 */
async function resolveMultiMarketQuery(
  text: string,
  ctx: FinancialContext,
  cur: string,
): Promise<AIChatResponse | null> {
  const scope = parseMultiScope(text);
  if (!scope) return null;
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  const inScope = filterByScope(ctx.holdings ?? [], scope);
  if (inScope.length === 0) {
    return say(`No encontré ${SCOPE_LABEL[scope]} en tus posiciones. Si las agregaste hace poco, dales un momento para cotizar.`);
  }
  // Alcance con modificador; sin modificador explícito asumimos el PRECIO ACTUAL.
  const mod = parsePriceModifier(text) ?? { kind: "current" as const };
  try {
    const { getMarketHighlights } = await import("@/lib/market-data");
    const { getFxRates } = await import("@/lib/market-data/fx-rates");
    const { convertCurrency } = await import("@/lib/fx");
    const { logger } = await import("@/lib/logger");
    const rates = await getFxRates();

    const rows: HoldingScenarioInput[] = [];
    for (const h of inScope) {
      const at = MARKET_TYPE[h.assetType] ?? "crypto";
      const hi = await getMarketHighlights(h.symbol ?? "", at); // STORE-first (best-effort)
      const scenCurrency = hi?.currency ?? cur;
      // ctx.holdings.invested está en moneda PRINCIPAL (cur) → convertir a la del escenario.
      const investedScen = Math.round(convertCurrency(h.invested, cur, scenCurrency, rates));
      rows.push({
        symbol: (h.symbol ?? "").toUpperCase(),
        quantity: h.quantity,
        investedScen,
        scenCurrency,
        high: hi?.high ?? null,
        price: hi?.price ?? null,
      });
    }
    const scenario = computeMultiScenario(rows, mod);
    logger.info("router.market_multi", { scope, mod: mod.kind, count: rows.length, missing: scenario.missing.length });
    return say(buildMultiReply(scenario, mod, SCOPE_LABEL[scope]));
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.error("router.market_multi falló", { scope, message: err instanceof Error ? err.message : "?" });
    return say("No pude calcular ese escenario ahora mismo; reintentá en un momento.");
  }
}

async function resolveMarketQuery(
  params: Record<string, unknown>,
  ctx: FinancialContext,
  cur: string,
): Promise<AIChatResponse | null> {
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  const text = typeof params.text === "string" ? params.text : "";
  const wantsAth = params.wantsAth === true;
  // Alcance MÚLTIPLE ("todos mis altcoins / toda mi cripto / mis inversiones") → carril multi.
  const multi = await resolveMultiMarketQuery(text, ctx, cur);
  if (multi) return multi;
  const holdings = ctx.holdings ?? [];
  const symbol = extractMarketSymbol(text, holdings.map((h) => ({ symbol: h.symbol, name: h.name })));
  if (!symbol) {
    // Pregunta de mercado sin símbolo claro → no forzamos; que el razonamiento la tome.
    return null;
  }
  const holding = holdings.find((h) => h.symbol?.toUpperCase() === symbol.toUpperCase());
  try {
    const { getMarketHighlights } = await import("@/lib/market-data");
    const { computeMarketScenario } = await import("@/lib/ai/tools");
    const { logger } = await import("@/lib/logger");

    // La POSICIÓN puede no estar en ctx.holdings (top-N compacto): posiciones chicas o con precio
    // $0 (bug del $0) quedan fuera y sin ellas no se calcula el escenario. Si el símbolo no está en
    // el top-N, se lee la posición COMPLETA por símbolo (scope de hogar). Best-effort: sin sesión
    // (WhatsApp) o sin posición → undefined y el carril sigue mostrando solo el dato de mercado.
    let cantidad = holding?.quantity;
    let invertido = holding?.invested;
    // OJO: ctx.holdings.invested (top-N del context-engine) ya está en la moneda PRINCIPAL (cur), NO
    // en la nativa del holding. Antes se usaba holding.currency (nativa): para un holding en USD y
    // display CRC, posCurrency=USD == scenCurrency=USD → NO convertía y mostraba el monto CRC con
    // símbolo $ (p. ej. "invertiste $2.731.089" para 0,15 BTC). La moneda de invertido acá es cur.
    let posCurrency = cur;
    let assetHint = holding?.assetType;
    if (!holding) {
      const full = await getFullPosition(symbol);
      if (full) {
        cantidad = full.quantity;
        invertido = full.invested;
        posCurrency = full.currency; // getPositionForSymbol devuelve invertido en moneda NATIVA
        assetHint = full.assetType;
      }
    }
    // Moneda que el usuario NO tiene (DOGE en el fixture): no le damos su precio/ATH como si fuera
    // info suya (la auditoría lo marcaba como alucinación). Sin posición (ni top-N ni completa) →
    // lo decimos honesto y NO consultamos el mercado. No inventar precio de posiciones no-tenidas.
    if (!(typeof cantidad === "number" && cantidad > 0)) {
      return say(
        `No veo ${symbol.toUpperCase()} entre tus inversiones, así que no te doy su precio como si fuera tuyo. Si la agregás a tu portafolio, te sigo el valor y te calculo escenarios.`,
      );
    }
    // assetType: del holding/posición si lo tiene; si no, cripto por defecto (tickers sueltos).
    const at = MARKET_TYPE[assetHint ?? ""] ?? "crypto";

    const h = await getMarketHighlights(symbol, at);
    logger.info("router.market_lane", { symbol, assetType: at, gotData: !!h, gotHigh: h?.high != null });

    // El máximo (ATH) viene en la moneda de highlights (USD en cripto). Lo invertido sale en la
    // moneda del holding; si difieren, se convierte para que cantidad×máximo − invertido sea coherente.
    const scenCurrency = h?.currency ?? cur;
    if (typeof invertido === "number" && posCurrency !== scenCurrency) {
      // Si el FX falla, convertInvested → null: se DESCARTA lo invertido (queda undefined) para no
      // mostrar CRC con símbolo $. El escenario sigue con valor/valor-al-máximo (cantidad × precio),
      // todo en scenCurrency; solo se omite la ganancia. Nunca moneda mezclada.
      const conv = await convertInvested(invertido, posCurrency, scenCurrency);
      invertido = conv ?? undefined;
    }

    const hasPosition = typeof cantidad === "number" && cantidad > 0;
    const scenario = computeMarketScenario({
      symbol: symbol.toUpperCase(),
      assetType: at,
      currency: scenCurrency,
      price: h?.price ?? null,
      high: h?.high ?? null,
      highKind: h?.highKind ?? null,
      highDate: h?.highDate ?? null,
      invertido,
      cantidad,
    });
    return say(buildMarketReply(scenario, scenario.currency, wantsAth, hasPosition, freshnessNote(h?.asOf, Date.now())));
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.error("router.market_lane falló", { symbol, message: err instanceof Error ? err.message : "?" });
    // Fallo real y distinguible (no el genérico "no tengo acceso").
    return say(`No pude leer los datos de ${symbol.toUpperCase()} ahora mismo; reintentá en un momento o decime a qué precio simular.`);
  }
}

/**
 * Redacta la respuesta de mercado a partir del escenario del motor (computeMarketScenario) — pura y
 * testeable. La cifra sale del tool; el asesor no la inventa. Fallo HONESTO y distinguible: si no hay
 * dato dice el motivo real (no encontrado / no se pudo leer), NUNCA "no tengo acceso al ATH".
 */
/**
 * Nota de FRESCURA honesta: si el dato del store tiene más de ~2 h (el cron no corrió), lo dice
 * ("precio guardado del DD/MM, no en vivo"). Fresco o sin fecha → "". Puro (recibe `nowMs`).
 */
export function freshnessNote(asOf: string | null | undefined, nowMs: number): string {
  if (!asOf) return "";
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return "";
  if (nowMs - t < 2 * 3600 * 1000) return ""; // fresco
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return ` (precio guardado del ${dd}/${mm}, no en vivo).`;
}

/**
 * Cantidad de unidades (puede ser fraccional en cripto): miles con PUNTO, decimales con coma, hasta
 * 6 decimales. Determinista (sin Intl) para coincidir con la política de formatMoney (idéntico en
 * servidor y cliente; es-CR/ICU agrupa distinto según el motor).
 */
function formatQuantity(n: number): string {
  const fixed = Number.isInteger(n) ? String(Math.trunc(n)) : n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const [int = "0", dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${grouped},${dec}` : grouped;
}

export function buildMarketReply(
  s: {
    symbol: string;
    precio_actual: number | null;
    maximo: number | null;
    maximo_tipo: "ath" | "52_semanas" | null;
    maximo_fecha?: string | null;
    cantidad?: number | null;
    invertido?: number | null;
    valor_actual: number | null;
    ganancia_al_precio_actual: number | null;
    valor_al_maximo: number | null;
    ganancia_al_maximo: number | null;
  },
  currency: string,
  wantsAth: boolean,
  hasPosition: boolean,
  freshness = "",
): string {
  // Cripto-aware: un precio/ATH < $1 con formatMoney (fiat, 0 dec) salía "$0" — parecía "sin dato".
  const money = (n: number) => formatMarketMoney(n, currency);
  if (s.precio_actual === null && s.maximo === null) {
    return `No pude leer los datos de ${s.symbol} en la fuente ahora mismo; reintentá en un momento o decime a qué precio querés que simule.`;
  }
  const maxLabel = s.maximo_tipo === "ath" ? "su máximo histórico (ATH)" : "su máximo de 52 semanas";
  const maxShort = s.maximo_tipo === "ath" ? "ATH" : "máximo de 52 semanas";
  const fecha = s.maximo_fecha ? ` (${s.maximo_fecha})` : "";
  const knowsQty = typeof s.cantidad === "number";

  // Intro: si conocemos la posición, la NOMBRAMOS ("tenés X"); "invertiste Y" SOLO si el invertido
  // está en la moneda del escenario (si el FX falló, llega undefined y se omite — nunca CRC-como-$).
  // Precio ≤0 ya llega como null → NUNCA imprimimos "$0"; si falta, lo decimos honesto.
  const parts: string[] = [];
  if (hasPosition && knowsQty) {
    const inv = typeof s.invertido === "number" ? ` (invertiste ${money(s.invertido)})` : "";
    parts.push(`Tenés ${formatQuantity(s.cantidad!)} ${s.symbol}${inv}`);
    if (s.precio_actual === null) parts.push("ahora no tengo el precio actual");
  } else if (s.precio_actual !== null) {
    parts.push(`${s.symbol} cotiza hoy a ${money(s.precio_actual)}`);
  }
  if (s.maximo !== null && !(hasPosition && wantsAth)) parts.push(`${maxLabel} fue ${money(s.maximo)}`);
  let reply = parts.length ? parts.join("; ") + "." : "";

  if (hasPosition && wantsAth) {
    // El VALOR al máximo (cantidad × máximo) se muestra aunque no sepamos lo invertido; la GANANCIA
    // se agrega solo si el invertido está disponible en la misma moneda (si no, se omite, no se inventa).
    if (s.maximo !== null && s.valor_al_maximo !== null) {
      const gain =
        s.ganancia_al_maximo !== null ? ` — ganancia de ${money(s.ganancia_al_maximo)} sobre lo invertido` : "";
      const hoy =
        gain && s.ganancia_al_precio_actual !== null ? ` (hoy, al precio actual, sería ${money(s.ganancia_al_precio_actual)})` : "";
      reply += ` Al ${maxShort} de ${money(s.maximo)}${fecha} tu posición valdría ${money(s.valor_al_maximo)}${gain}${hoy}. Ojo: el máximo es pasado y no se puede cronometrar el techo — es un escenario, no un plan.`;
    } else {
      reply += ` No tengo el máximo para calcular ese escenario; decime a qué precio simular.`;
    }
  } else if (hasPosition && s.ganancia_al_precio_actual !== null) {
    reply += ` Al precio actual, tu ganancia sobre lo invertido es ${money(s.ganancia_al_precio_actual)}.`;
  }
  return reply.trim() + freshness;
}

/**
 * Intenta resolver la pregunta por el carril barato. Devuelve el resultado (con su carril y
 * tokens) o null si hay que escalar al razonamiento (modelo completo). NUNCA adivina: si el
 * patrón no matchea Y el clasificador no está seguro, o el contexto no alcanza → null.
 */
/** Resultado de matchIntent (patrón), ya sin null. Público para el CONTEXTO PEREZOSO de la ruta. */
export type MatchedIntent = NonNullable<ReturnType<typeof matchIntent>>;

/**
 * Resuelve un intent YA matcheado por patrón (0 tokens): mercado / lectura fresca / cifra del ctx.
 * Extraído de tryRouteQuery para que la ruta pueda correrlo tras construir SOLO el contexto que ese
 * carril necesita (contexto perezoso). Devuelve null si el dato no alcanza → el llamador escala al LLM.
 */
export async function resolveMatchedIntent(
  matched: MatchedIntent,
  ctx: FinancialContext,
  toolContext: ToolContext,
): Promise<RoutedQuery | null> {
  // INFORME de inversiones (carril DEEP): paquete de evidencia + plantilla. CERO tokens y cero
  // llamadas nuevas — todo sale del ctx/toolContext que la ruta ya construyó. Sin posiciones ni valor
  // de inversión NO se emite un informe vacío: devuelve null y el llamador escala al LLM.
  if (matched.intent === "informe_inversion") {
    const pack = buildEvidencePack(ctx, toolContext);
    if (!pack.tieneInversiones) return null;
    return {
      response: { reply: renderEvidenceReport(pack, pack.currency), action: null },
      tokensIn: 0,
      tokensOut: 0,
      lane: "deep",
    };
  }

  // Datos de mercado (precio/ATH): usa ctx.holdings + el tool. Si no resuelve el símbolo o no hay
  // dato, devuelve la respuesta honesta (no escala a repetir negativas).
  if (matched.intent === "datos_mercado") {
    const response = await resolveMarketQuery(matched.params, ctx, toolContext.currency);
    return response ? { response, tokensIn: 0, tokensOut: 0, lane: "template" } : null;
  }
  if (FETCH_INTENTS.has(matched.intent)) {
    const response = await resolveFetchIntent(matched.intent, toolContext.currency, matched.params);
    return response ? { response, tokensIn: 0, tokensOut: 0, lane: "template" } : null;
  }
  const response = answerFromContext(matched.intent, matched.params, toolContext, ctx);
  if (response) return { response, tokensIn: 0, tokensOut: 0, lane: "template" };
  return null; // el contexto no alcanza → escalar
}

export async function tryRouteQuery(
  messages: { role: string; content: string }[],
  ctx: FinancialContext,
  toolContext: ToolContext,
): Promise<RoutedQuery | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.trim();
  if (!lastUser) return null;

  // 1) Patrones (0 tokens de clasificación).
  const matched = matchIntent(lastUser);
  if (matched) return await resolveMatchedIntent(matched, ctx, toolContext);

  // 1b) Carril de ACCIÓN determinista: intents de CREAR (alerta, meta, sobre, gasto). Va DESPUÉS de
  //     los intents de lectura (que ganan) y ANTES del LLM: el parseo/propuesta salen del router,
  //     0 tokens. La acción propuesta va a la tarjeta de confirmación (nada se ejecuta sin confirmar).
  const created = detectCreateAction(lastUser, {
    currency: toolContext.currency,
    holdings: (ctx.holdings ?? []).map((h) => ({ symbol: h.symbol, name: h.name, assetType: h.assetType })),
    today: await userToday(),
  });
  if (created) return { response: created, tokensIn: 0, tokensOut: 0, lane: "template" };

  // 2) Clasificador Flash-Lite (barato). Solo si no matchó patrón.
  const classified = await classifyWithLite(lastUser);
  if (!classified) return null; // ante duda, razonamiento
  const response = FETCH_INTENTS.has(classified.intent)
    ? await resolveFetchIntent(classified.intent, toolContext.currency, classified.params)
    : answerFromContext(classified.intent, classified.params, toolContext, ctx);
  if (!response) return null;
  // La respuesta es plantilla (0 tokens de generación); solo se pagó la clasificación.
  return { response, tokensIn: classified.tokensIn, tokensOut: classified.tokensOut, lane: "lite" };
}
