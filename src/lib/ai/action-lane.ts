/**
 * Carril de ACCIÓN determinista (puro, sin "server-only": testeable). Detecta intents de CREAR
 * (alerta de precio, meta, sobre acumulable, gasto) por PATRÓN y arma la propuesta de acción con
 * sus params — CERO tokens de LLM. La acción propuesta va a la tarjeta de confirmación (el usuario
 * confirma; recién ahí la server action ejecuta). El LLM queda como fallback para fraseo ambiguo.
 *
 * REGLA: si el intent matchea pero falta un dato clave, NO inventamos: pedimos SOLO ese dato
 * (action = null, reply con la pregunta corta). Nunca respondemos "no puedo crear …".
 */
import type { AIChatResponse, AIActionProposal } from "@/lib/ai/types";
import { extractFechaNatural, fechaLegible } from "@/lib/ai/fecha-natural";

export type KnownHolding = { symbol: string | null; name: string; assetType?: string };

export type ActionLaneOptions = {
  currency: string;
  holdings?: KnownHolding[];
  /** Fecha de hoy YYYY-MM-DD (inyectada para pureza/determinismo). */
  today: string;
};

// Palabras en MAYÚSCULA que NO son tickers (evita falsos símbolos).
const TICKER_STOP = new Set(["ATH", "USD", "CRC", "EUR", "IA", "ETF"]);

/** Extrae un ticker (2-6 letras/dígitos en MAYÚSCULA) o lo matchea contra las posiciones conocidas. */
export function extractSymbol(text: string, holdings: KnownHolding[] = []): string | null {
  const bySymbol = new Set(
    holdings.map((h) => h.symbol?.toUpperCase()).filter(Boolean) as string[],
  );
  const upper = text.match(/\b[A-Z]{2,6}\d?\b/g) ?? [];
  // Primero: un ticker en mayúscula que sea de sus posiciones; si no, el primero no-stop.
  const known = upper.find((w) => bySymbol.has(w));
  if (known) return known;
  const free = upper.find((w) => !TICKER_STOP.has(w));
  if (free) return free;
  // Por nombre de la posición ("avisame cuando bitcoin llegue a…") → su ticker.
  const lower = text.toLowerCase();
  const byName = holdings.find((h) => h.name && lower.includes(h.name.toLowerCase()) && h.symbol);
  return byName?.symbol ? byName.symbol.toUpperCase() : null;
}

/** Primer número monetario del texto: admite 1.234,56 / 1,234.56 / $1 / 5000. Devuelve null si no hay. */
export function extractMoney(text: string): number | null {
  // Captura un run completo de dígitos con separadores opcionales (evita cortar 5000 → 500).
  const m = text.match(/(?:[$₡]|USD|CRC)?\s*(\d[\d.,]*\d|\d)/i);
  if (!m || !m[1]) return null;
  let raw = m[1];
  // Normaliza separadores: si hay ambos, el ÚLTIMO es el decimal; si hay uno solo y deja 3 dígitos
  // a la derecha, es de miles (1.000 = 1000), salvo que sea claramente decimal (1,5).
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasDot && hasComma) {
    const decSep = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    raw = raw.split(thouSep).join("").replace(decSep, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = raw.split(sep);
    const last = parts[parts.length - 1] ?? "";
    // "1.000" / "1,000" (grupo de 3) → miles; "1,5" / "0.25" → decimal.
    raw = parts.length > 1 && last.length === 3 ? parts.join("") : raw.replace(sep, ".");
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const say = (reply: string, action: AIActionProposal | null): AIChatResponse => ({ reply, action });

// ── Patrones de intent (español, voseo/tuteo) ──
// OJO: sin \b FINAL en verbos que pueden terminar en tilde (creá, registrá, avisá): en JS \b es
// ASCII y una vocal acentuada NO es \w, así que "\b…á\b" NUNCA matchea. Basta el \b inicial.
const ALERT_RE = /\b(alerta|alertame|avisa|avísame|avisame|avisar|avisá|notif)/i;
const GOAL_RE = /\bmeta( de ahorro)?\b/i;
const SOBRE_RE = /\b(sobre|frasco|acumulador)\b/i;
/**
 * GASTO. Tres piezas, porque el patrón viejo (`/\b(gast|compr|…)/`) era demasiado goloso:
 * "¿dónde puedo recortar gastos?" trae "gast" y se lo comía, contestando "¿de cuánto fue
 * el gasto?" a una pregunta de análisis. Registrar un gasto es una ORDEN o un HECHO, nunca
 * una pregunta.
 */
/** Orden de registrar: "registrá/anotá/apuntá/meté/cargá … un gasto". */
const EXPENSE_ORDER_RE = /\b(?:registr|anot|apunt|met[eé]|carg[aá]|agreg|añad|anad)/i;
/** Sustantivo del movimiento, para acompañar a la orden ("anotá UN GASTO de …"). */
const EXPENSE_NOUN_RE = /\bgast|\bcompr|\bpag|\bmovimiento|\btransacci/i;
/**
 * Hecho consumado en 1ª persona: "gasté 5000 en el súper", "pagué el recibo".
 * El cierre es un lookahead de "no-letra", no \b: en JS \b es ASCII y una vocal acentuada
 * no es \w, así que "\bgast[eé]\b" nunca matchearía "gasté" (misma trampa que los verbos
 * en voseo de arriba). Así entra "gasté"/"gaste" y quedan fuera "gastos" y "gastemos".
 */
const EXPENSE_FACT_RE = /\b(?:gast[eé]|compr[eé]|pagu[eé]|me cobraron)(?!\p{L})/iu;
/**
 * Lenguaje de ANÁLISIS de gastos: recortar, reducir, optimizar, en qué se va la plata.
 * Nunca es una captura, ni siquiera en imperativo ("recortá mis gastos" pide un análisis,
 * no registra nada). Va al LLM, que tiene el desglose por sobre.
 */
const EXPENSE_ANALYSIS_RE =
  /\brecort|\breduc|\brebaj|\boptimiz|\bahorrar\b|\bbajar\b|\bd[oó]nde\b|\ben qu[eé](?!\p{L})|\bse me va\b|\bse va (?:la|mi)\b/iu;

/**
 * ¿Es una PREGUNTA? Signo de interrogación (de apertura o de cierre) o arranque con
 * palabra interrogativa. Es deliberadamente amplia: un falso positivo solo manda la frase
 * al LLM —que igual sabe registrar—, mientras que un falso negativo le contesta al usuario
 * con una pregunta absurda. Ante duda, escalá.
 */
export function isQuestion(t: string): boolean {
  if (/[¿?]/.test(t)) return true;
  // Cierre con lookahead y no \b, por lo mismo que arriba (á/é/í no son \w en JS).
  return /^\s*(?:d[oó]nde|c[oó]mo|cu[aá]l|cu[aá]nt\w*|cu[aá]ndo|qu[eé]|por qu[eé]|para qu[eé]|puedo|podr[ií]a|se puede|me conviene)(?!\p{L})/iu.test(
    t,
  );
}
const CREATE_VERB_RE =
  /\b(cre[aá]|crear|hac[eé]|hacer|nuev[oa]|agreg|arm[aá]|arma|pon[eé]|ponme|añad|generame|gener[aá]|abr[íi]|abrir|configur)/i;
// Verbo IMPERATIVO de alerta (para no confundir "creá una alerta" con "tengo alertas activas").
const ALERT_CREATE_SIGNAL =
  /\b(avisa|avísame|avisame|avisá|alertame|generame|gener[aá]|ponme|pon[eé]|cre[aá]|crear|configur|agreg|arm[aá]|arma|quiero|necesito)/i;

/** Nombre de la meta/sobre: preferí "para X", luego "llamad[oa]/objetivo X", luego "sobre/meta X". */
function extractName(text: string): string | null {
  const patterns = [
    /\bpara\s+(?:mi\s+|el\s+|la\s+|un\s+|una\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/iu,
    /\b(?:llamad[oa]|objetivo|nombre)\s+["“']?([\p{L}][\p{L}\p{N} '-]{1,40}?)["”']?\s*(?:$|[.,;!?])/iu,
    /\b(?:sobre|frasco|meta)\s+(?:de\s+|para\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/iu,
  ];
  for (const re of patterns) {
    const cand = text.match(re)?.[1]?.trim();
    if (cand && !/^(?:de\s+)?ahorro$/i.test(cand)) return cand;
  }
  return null;
}

/**
 * ¿Es una ORDEN de dar de alta un movimiento, con su monto?
 *
 * Es la señal que le da PRECEDENCIA al carril de ACCIÓN sobre todos los de consulta. Sin esto,
 * "Agrega un gasto a transporte de vehículo de 37747 el día 2 de agosto" se contestaba como
 * búsqueda ("no tenés gastos en …"): el mensaje trae la palabra "gasto" y el mes, así que
 * `consulta_transacciones` lo matcheaba primero y `detectCreateAction` —que corre DESPUÉS— no
 * llegaba a verlo nunca. Un alta contestada como consulta es el peor de los dos errores: el
 * usuario cree que registró y no registró nada.
 *
 * Las tres condiciones son las mismas que usa la rama de GASTO, así que esto no puede abrirle la
 * puerta a nada que el carril luego no proponga: pregunta → no; lenguaje de análisis → no; sin
 * monto → no (ahí la ambigüedad es real y el LLM decide mejor).
 */
export function esOrdenDeAltaDeMovimiento(text: string, hoy?: string): boolean {
  const t = text.trim();
  if (isQuestion(t) || EXPENSE_ANALYSIS_RE.test(t)) return false;
  return pideAltaDeMovimiento(t, hoy);
}

/**
 * Las señales de un alta CON monto, sin mirar si la frase es una pregunta.
 *
 * Se separa de `esOrdenDeAltaDeMovimiento` porque hay un caso donde la pregunta SÍ pide un alta:
 * "¿me registrás un gasto de 5000 en el súper?". Para dar precedencia sobre los carriles de
 * consulta eso no alcanza (una pregunta se responde), pero para decidir si una propuesta
 * PERTENECE al turno sí: ahí lo que importa es que el usuario pidió registrar algo.
 */
export function pideAltaDeMovimiento(text: string, hoy?: string): boolean {
  const t = text.trim();
  if (!(EXPENSE_FACT_RE.test(t) || (EXPENSE_ORDER_RE.test(t) && EXPENSE_NOUN_RE.test(t)))) {
    return false;
  }
  return montoSinFecha(t, hoy ?? "9999-12-31") !== null;
}

/**
 * Monto del mensaje IGNORANDO el fragmento que es una fecha. "…de 37747 el día 2 de agosto" tiene
 * dos números y solo uno es plata: sin sacar la fecha primero, "el 2 de agosto de 2026" aportaba
 * un "2" que en otras frases ("el 15, gasté 3000") ganaba por venir antes.
 */
function montoSinFecha(t: string, hoy: string): number | null {
  const fecha = extractFechaNatural(t, hoy);
  return extractMoney(fecha ? t.replace(fecha.texto, " ") : t);
}

/**
 * ¿El carril está PIDIENDO el monto de una meta DISCRECIONAL (Paso 3.13)? Cuando `detectCreateAction`
 * intercepta "abrime una meta de ahorro para un viaje de lujo" y devuelve "¿De cuánto es la meta?" ANTES
 * del LLM, un usuario con una prioridad sin cubrir queda facilitado en vez de confrontado. Este predicado
 * (PURO) marca ese caso para que el router lo deje pasar al LLM (que reconduce con la regla del prompt).
 * Criterio AMPLIO: cualquier meta que NO sea de DEFENSA (fondo/emergencia/colchón/deuda) es discrecional.
 * NO decide si hay prioridad — eso lo chequea el router con `ctx.señalPrioritaria`.
 */
export function pideMontoDeMetaDiscrecional(
  created: AIChatResponse | null,
  message: string,
): boolean {
  if (!created || created.action !== null) return false; // ya propuso la meta (con monto) → no aplica
  if (!/¿de cu[aá]nto es la meta/i.test(created.reply)) return false; // no está pidiendo el monto
  const norm = message.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return !/\b(fondo|emergencia|colch|deuda|tarjeta|prestamo)\b/.test(norm); // no es de defensa → discrecional
}

/**
 * Detecta un intent de CREAR y arma la propuesta (o pide el dato faltante). null si no es un create.
 */
export function detectCreateAction(text: string, opts: ActionLaneOptions): AIChatResponse | null {
  const t = text.trim();
  // Preguntas de CONSEJO ("¿debería crear una meta?", "¿conviene…?") NO son órdenes de crear:
  // van al razonamiento, no al carril de acción.
  if (
    /\b(deber[ií]a|convien|convendr[ií]a|es mejor|vale la pena|qu[eé] (?:pienso|opin[aá]|recomend)|me recomend|ser[ií]a bueno)\b/i.test(
      t,
    )
  ) {
    return null;
  }
  const pregunta = isQuestion(t);
  // La FECHA se lee ANTES que el monto y su fragmento se saca del texto: el "2" de "el día 2 de
  // agosto" no es plata, y en "el 15, gasté 3000" ganaba por venir primero.
  const fecha = extractFechaNatural(t, opts.today);
  const money = extractMoney(fecha ? t.replace(fecha.texto, " ") : t);

  // 1) ALERTA DE PRECIO — "alerta/avisame … {símbolo} … {precio}". La dirección la infiere el
  //    servidor con el precio actual (createInvestmentAlert); acá solo símbolo + objetivo. Se
  //    requiere una señal de CREAR (imperativo) o un precio, para no secuestrar lecturas
  //    ("¿tengo alertas activas?" no trae ni verbo de crear ni monto → no entra).
  if (ALERT_RE.test(t) && (ALERT_CREATE_SIGNAL.test(t) || money !== null)) {
    const symbol = extractSymbol(t, opts.holdings);
    if (!symbol) {
      return say("¿Para qué símbolo querés la alerta? Decime el ticker (p. ej. JUP, BTC).", null);
    }
    if (money === null) {
      return say(`¿A qué precio te aviso de ${symbol}?`, null);
    }
    // assetType: de la posición del usuario si la tiene; si no, cripto (los tickers sueltos suelen serlo).
    const held = opts.holdings?.find((h) => h.symbol?.toUpperCase() === symbol);
    const assetType = held?.assetType ?? "cripto";
    // Moneda de cotización: cripto siempre USD; cotizadas → la del usuario (aprox., editable luego).
    const alertCurrency = assetType === "cripto" ? "USD" : opts.currency;
    const money$ = formatMoneyPlain(money, alertCurrency);
    return say(
      `Te propongo crear una alerta de precio de ${symbol} en ${money$}. Confirmá abajo.`,
      {
        type: "create_price_alert",
        payload: { symbol, targetPrice: money, assetType, currency: alertCurrency },
        summary: `Alerta ${symbol} a ${money$}`,
      },
    );
  }

  // 2) SOBRE acumulable (savings_goals kind='sobre') — "creá un sobre de X". Antes que META porque
  //    "sobre de ahorro" también trae "ahorro"; el sobre no lleva objetivo.
  if (SOBRE_RE.test(t) && CREATE_VERB_RE.test(t)) {
    const name = extractName(t) ?? "Sobre";
    return say(`Te propongo crear el sobre "${name}". Confirmá abajo.`, {
      type: "create_goal",
      payload: { kind: "sobre", name, currency: opts.currency, targetAmount: null },
      summary: `Sobre ${name}`,
    });
  }

  // 3) META de ahorro — "meta de ahorro de $Y [para NOMBRE]".
  if (GOAL_RE.test(t) && (CREATE_VERB_RE.test(t) || money !== null)) {
    const name = extractName(t) ?? "Meta de ahorro";
    if (money === null) {
      return say(`¿De cuánto es la meta "${name}"?`, null);
    }
    return say(
      `Te propongo crear la meta "${name}" por ${formatMoneyPlain(money, opts.currency)}. Confirmá abajo.`,
      {
        type: "create_goal",
        payload: { kind: "meta", name, targetAmount: money, currency: opts.currency },
        summary: `Meta ${name}`,
      },
    );
  }

  // 4) GASTO — "registrá/anotá un gasto de $Z en W" o "gasté $Z en W".
  //    Una PREGUNTA nunca registra: "¿dónde puedo recortar gastos?" es análisis, no captura,
  //    y con el patrón viejo caía acá y contestaba "¿de cuánto fue el gasto?". Tampoco entra
  //    el lenguaje de recortar/reducir aunque venga en imperativo ("recortá mis gastos").
  //    Todo eso sale por null → LLM con contexto, que es quien sabe dónde recortar.
  if (
    !pregunta &&
    !EXPENSE_ANALYSIS_RE.test(t) &&
    (EXPENSE_FACT_RE.test(t) || (EXPENSE_ORDER_RE.test(t) && EXPENSE_NOUN_RE.test(t)))
  ) {
    const desc = extractExpenseDesc(fecha ? t.replace(fecha.texto, " ") : t) ?? "Gasto";
    if (money === null) {
      return say(`¿De cuánto fue el gasto${desc !== "Gasto" ? ` en ${desc}` : ""}?`, null);
    }
    // FECHA: la que dijo el usuario; hoy solo si no dijo ninguna. Si dijo una y no se pudo
    // interpretar, se cae a hoy pero se DICE y el texto original viaja a la tarjeta (`dateText`),
    // que lo repite junto al campo editable. Ignorarla en silencio mandaba el gasto a otro mes.
    const occurredOn = fecha?.iso ?? opts.today;
    const cuando =
      fecha?.iso != null
        ? ` el ${fechaLegible(fecha.iso)}`
        : fecha
          ? ` con fecha de hoy (${fechaLegible(opts.today)})`
          : "";
    const aviso = fecha
      ? fecha.iso != null
        ? ""
        : fecha.motivo === "futura"
          ? ` La fecha que dijiste («${fecha.texto}») es futura, así que no la usé — corregila abajo si hace falta.`
          : ` No entendí la fecha que dijiste («${fecha.texto}») — corregila abajo si hace falta.`
      : "";
    return say(
      `Te propongo registrar un gasto de ${formatMoneyPlain(money, opts.currency)} en "${desc}"${cuando}.${aviso} Confirmá abajo.`,
      {
        type: "create_transaction",
        payload: {
          kind: "gasto",
          description: desc,
          amount: money,
          currency: opts.currency,
          occurredOn,
          ...(fecha && fecha.iso === null ? { dateText: fecha.texto } : {}),
        },
        summary: `Gasto ${desc}`,
      },
    );
  }

  return null;
}

/**
 * Descripción del gasto: primer "en/de/para/por/a X" que NO sea el monto. Preferí "en X".
 *
 * "a" entró a la lista por "Agrega un gasto A TRANSPORTE de vehículo…": sin ella el destino del
 * gasto no se leía y la descripción salía del "de" siguiente ("vehículo de 37747"). Va última en
 * la alternancia para no ganarle a las preposiciones más específicas.
 *
 * El candidato se limpia del monto que pueda haber quedado pegado al final ("transporte de
 * vehículo de 37747" → "transporte de vehículo"): el importe ya se leyó aparte y repetirlo en la
 * descripción es lo que hacía que el texto de la propuesta se viera como una búsqueda fallida.
 */
function extractExpenseDesc(text: string): string | null {
  const all = [
    ...text.matchAll(
      /\b(?:en|de|para|por|a)\s+(?:el\s+|la\s+|un\s+|una\s+|mi\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/giu,
    ),
  ];
  for (const m of all) {
    const cand = m[1]
      ?.replace(/\s+(?:de|por|en|a)?\s*\d[\d.,]*$/i, "")
      .replace(/\s+(?:de|del|por|en|a|con|para|desde|hasta)$/i, "")
      .trim();
    if (cand && !/^\d[\d.,]*$/.test(cand)) return cand;
  }
  return null;
}

/** Formato de dinero simple y determinista (miles con punto), sin depender de Intl. */
function formatMoneyPlain(amount: number, currency: string): string {
  const [int = "0", dec] = Math.abs(amount)
    .toFixed(amount % 1 === 0 ? 0 : 2)
    .split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sym = currency === "USD" ? "$" : currency === "CRC" ? "₡" : `${currency} `;
  return dec ? `${sym}${grouped},${dec}` : `${sym}${grouped}`;
}
