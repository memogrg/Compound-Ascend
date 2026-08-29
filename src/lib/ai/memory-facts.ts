/**
 * MEMORIA DE HECHOS — el núcleo PURO (sin "server-only", sin red, sin BD: testeable entero).
 *
 * Qué guarda: lo que la persona cuenta al pasar y espera que el asesor recuerde para siempre
 * ("mi esposa se llama Fernanda", "quiero mudarme a Escazú en 2027"). Qué NO guarda: nada que ya
 * viva en otra capa — la guía del asesor está en `coaching-store`, las respuestas del cuestionario
 * en el perfil estructurado, y las CIFRAS en el FinancialContext, que se leen en vivo.
 *
 * LA REGLA DURA: nada financiero-numérico. Es una guarda de CÓDIGO (`tieneCifraFinanciera`), no una
 * línea del prompt, porque el prompt es una sugerencia y esto no puede fallar: un "gasté ₡50.000"
 * memorizado se vuelve stale en un día y el asesor lo recitaría como verdad. Eso es un bug de
 * honestidad, y la fuente de esa cifra ya existe y es correcta.
 *
 * El dedup NO usa embeddings a propósito: con un tope de MAX_ACTIVE_FACTS por usuario, normalizar +
 * solapar tokens es exacto, gratis y testeable sin red. `esMismoHecho` es la única costura que
 * habría que cambiar si algún día el corpus lo justifica.
 */

export const MEMORY_CATEGORIES = [
  "familia",
  "meta_vida",
  "preferencia",
  "trabajo",
  "salud",
  "otro",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** Etiquetas para la UI (Ajustes). Español neutro: sirven al voseo de la web y al "tú" del móvil. */
export const MEMORY_CATEGORY_LABEL: Record<MemoryCategory, string> = {
  familia: "Familia",
  meta_vida: "Planes de vida",
  preferencia: "Preferencias",
  trabajo: "Trabajo",
  salud: "Salud",
  otro: "Otro",
};

/** Un hecho recién extraído, todavía sin fila en la BD. */
export type ExtractedFact = { fact: string; category: MemoryCategory };

/** Un hecho ya persistido (lo que devuelve el store). */
export type StoredFact = {
  id: string;
  fact: string;
  category: MemoryCategory;
  status: "activa" | "archivada";
  updatedAt: string;
  createdAt: string;
};

/** Largo máximo de un hecho. Es UNA frase: más que esto ya es un párrafo, y un párrafo no se recuerda. */
export const MAX_FACT_LEN = 160;

/** Hechos que una sola corrida puede extraer por usuario. Un día de chat no produce 30 hechos nuevos. */
export const MAX_FACTS_PER_RUN = 8;

/** Tope de hechos ACTIVOS por usuario. Al superarlo se archivan los más viejos no re-confirmados. */
export const MAX_ACTIVE_FACTS = 100;

/** Cuántos hechos se inyectan al contexto del LLM. Acota el prompt: la memoria no puede crecer sin techo. */
export const MAX_MEMORY_INJECTED = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Normalización y tokens
// ─────────────────────────────────────────────────────────────────────────────

/** Sin acentos, en minúsculas, sin puntuación y con un solo espacio. Base de toda comparación. */
export function normalizeFact(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que no distinguen un hecho de otro. Incluye los verbos "vacíos" de declaración
 * (quiero, tengo, vamos): sin sacarlos, "quiero mudarme" y "quiero cambiar de trabajo" comparten
 * "quiero" y la detección de contradicción archivaría el hecho equivocado.
 */
const STOPWORDS = new Set(
  (
    "a al algo ante antes aqui asi aun cada como con contra cual cuando de del desde donde dos el ella " +
    "ellas ellos en entre era eres es esa ese eso esta estan este esto estoy fue ha hace hasta hay la " +
    "las le les lo los mas me mi mia mio mis mucho muy nada ni nos nuestra nuestro o para pero poco por " +
    "porque que quien se sea segun ser si sin sobre solo son su sus tan te ti todo todos tu tus un una " +
    "uno unos vos y ya " +
    "quiero queremos quiere quieren queria querian gustaria voy vamos va van tengo tenemos tiene tienen " +
    "hacer haciendo estar soy somos dice dijo digo llamo llama llaman siempre nunca"
  ).split(" "),
);

/** Tokens con contenido: sin stopwords y de 3+ letras. Es lo que define "de qué habla" un hecho. */
export function contentTokens(text: string): string[] {
  return normalizeFact(text)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Dos tokens hablan de lo mismo si son iguales o comparten 5 letras de raíz. Es el stemming mínimo
 * que hace falta para que "mudarnos" y "mudarme" cuenten como el mismo tema — sin él, "ya no
 * queremos mudarnos" no contradice a "quiere mudarse a Escazú" y quedarían los dos activos.
 */
function mismoToken(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/** Cuántos tokens de contenido de `a` tienen equivalente en `b`. */
function solapamiento(a: string[], b: string[]): number {
  return a.filter((t) => b.some((u) => mismoToken(t, u))).length;
}

/** Similitud tipo Jaccard sobre tokens de contenido (0..1). 0 si alguno no tiene contenido. */
export function similitud(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const comunes = solapamiento(ta, tb);
  return comunes / (ta.length + tb.length - comunes);
}

/** Umbral de "es el mismo hecho dicho de otra forma". Alto: duplicar molesta menos que fusionar dos hechos distintos. */
const SIM_MISMO = 0.6;

/**
 * ¿`a` y `b` son el MISMO hecho? Igualdad normalizada, contención (uno es el otro con más detalle)
 * o similitud alta. Un hecho repetido re-confirma el existente en vez de duplicarlo.
 */
export function esMismoHecho(a: string, b: string): boolean {
  const na = normalizeFact(a);
  const nb = normalizeFact(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return similitud(a, b) >= SIM_MISMO;
}

// ─────────────────────────────────────────────────────────────────────────────
// La guarda dura: nada financiero-numérico
// ─────────────────────────────────────────────────────────────────────────────

/** Símbolos y nombres de moneda. Con un dígito al lado, es una cifra financiera. */
const MONEDA_RE = /[₡$€£¥]|\b(colones?|dolares?|dólares?|euros?|usd|crc|eur|colon)\b/i;
/** "50 mil", "3 millones": magnitud escrita con dígitos. */
const MAGNITUD_RE = /\d[\d.,]*\s*(mil|millon|millones|millón|k)\b/i;
/** 1.234 / 1,234: separador de miles → monto, nunca un año. */
const MILES_RE = /\b\d{1,3}(?:[.,]\d{3})+\b/;
/** Cualquier entero de 4+ dígitos que NO sea un año plausible (1900-2100). */
const ENTERO_GRANDE_RE = /\b\d{4,}\b/g;

function esAnioPlausible(s: string): boolean {
  if (s.length !== 4) return false;
  const n = Number(s);
  return n >= 1900 && n <= 2100;
}

/**
 * `true` si el texto contiene una CIFRA financiera. Bloquea la escritura, pase lo que pase con el
 * prompt del extractor. Los TEMAS financieros sí se guardan ("no toco el fondo de paz ni de
 * chiste" es una preferencia declarada y vale oro); lo que nunca entra son los NÚMEROS, porque su
 * fuente viva ya está en el contexto y una copia memorizada solo puede envejecer mal.
 *
 * Un año (2027) NO es una cifra financiera: "quiere mudarse a Escazú en 2027" tiene que pasar.
 */
export function tieneCifraFinanciera(text: string): boolean {
  if (/%/.test(text)) return true;
  if (MONEDA_RE.test(text) && /\d/.test(text)) return true;
  if (MAGNITUD_RE.test(text)) return true;
  if (MILES_RE.test(text)) return true;
  const grandes = text.match(ENTERO_GRANDE_RE) ?? [];
  return grandes.some((g) => !esAnioPlausible(g));
}

// ─────────────────────────────────────────────────────────────────────────────
// Contradicción
// ─────────────────────────────────────────────────────────────────────────────

/** Marcas de que el usuario está DANDO DE BAJA algo que dijo antes. */
const NEGACION_RE =
  /\b(ya no|no quier\w+|dejamos de|deje de|dejaron de|cambie de idea|cambiamos de idea|nunca mas|ya no vamos|ya no queremos|se cancel\w+|nos separamos|me divorci\w+|renunci\w+)\b/i;

/** `true` si la frase declara una baja/cambio de algo previo (no es un hecho nuevo cualquiera). */
export function esNegacion(text: string): boolean {
  return NEGACION_RE.test(normalizeFact(text));
}

/**
 * ¿`nuevo` CONTRADICE a `viejo`? Pide las dos cosas: que el nuevo sea una negación y que hablen del
 * mismo tema (al menos un token de contenido en común, con la raíz de 5 letras). Sin el segundo
 * requisito, un "ya no trabajo ahí" archivaría el nombre de la esposa.
 */
export function contradice(nuevo: string, viejo: string): boolean {
  if (!esNegacion(nuevo)) return false;
  if (esMismoHecho(nuevo, viejo)) return false;
  return solapamiento(contentTokens(nuevo), contentTokens(viejo)) >= 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// El plan de escritura (puro): qué insertar, qué re-confirmar, qué archivar
// ─────────────────────────────────────────────────────────────────────────────

export type MemoryPlan = {
  /** Hechos NUEVOS a insertar. */
  inserts: ExtractedFact[];
  /** Ids de hechos ya existentes que el usuario volvió a decir → solo se les toca `updated_at`. */
  touches: string[];
  /** Ids a archivar porque el usuario los contradijo. */
  archives: string[];
};

/**
 * Decide qué hacer con lo extraído contra lo que ya está guardado. TODO el criterio de dedup y
 * contradicción vive acá, puro, para poder probarlo sin BD ni LLM.
 *
 * Orden de las reglas por hecho extraído:
 *   1. ¿Ya lo sé? → re-confirmo (touch), no duplico.
 *   2. ¿Contradice algo que sé? → archivo lo viejo y guardo lo nuevo.
 *   3. Si no → lo guardo.
 * Además deduplica DENTRO de la misma corrida: el usuario puede repetir el mismo hecho dos veces
 * en el día y no van a entrar dos filas.
 */
export function planMemoryWrites(existentes: StoredFact[], extraidos: ExtractedFact[]): MemoryPlan {
  const activos = existentes.filter((f) => f.status === "activa");
  const plan: MemoryPlan = { inserts: [], touches: [], archives: [] };
  const yaArchivados = new Set<string>();

  for (const cand of extraidos) {
    const fact = cand.fact.trim();
    if (!fact) continue;

    // 1. Ya lo tengo guardado.
    const igual = activos.find((f) => !yaArchivados.has(f.id) && esMismoHecho(fact, f.fact));
    if (igual) {
      if (!plan.touches.includes(igual.id)) plan.touches.push(igual.id);
      continue;
    }
    // …o ya lo voy a insertar en esta misma corrida (el usuario lo repitió en el día).
    if (plan.inserts.some((i) => esMismoHecho(fact, i.fact))) continue;

    // 2. Da de baja algo que ya sabía.
    const contradichos = activos.filter((f) => !yaArchivados.has(f.id) && contradice(fact, f.fact));
    for (const c of contradichos) {
      yaArchivados.add(c.id);
      plan.archives.push(c.id);
    }

    // 3. Entra como hecho nuevo (también cuando fue una baja: la baja MISMA es lo que ahora es cierto).
    plan.inserts.push({ fact, category: cand.category });
  }

  return plan;
}

/**
 * Ids a archivar por TOPE. Se ordena por re-confirmación (`updatedAt`) y caen los más viejos: un
 * hecho que el usuario sigue mencionando se re-confirma y sube, así que el que cae es el que dejó
 * de ser parte de su vida. Nunca borra: archiva, y el usuario lo ve en Ajustes.
 */
export function planOverflow(activos: StoredFact[], max: number = MAX_ACTIVE_FACTS): string[] {
  if (activos.length <= max) return [];
  return [...activos]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(max)
    .map((f) => f.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// El extractor: prompt, entrada y parseo (todo puro; la llamada vive en el servicio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prompt del extractor. ESTRICTO y en negativo: lo que más importa es lo que NO puede salir.
 * Las prohibiciones que no pueden fallar están además en código (`tieneCifraFinanciera` y el
 * filtro de roles de `turnosParaExtractor`) — el prompt orienta, el código garantiza.
 */
export function buildExtractorSystemPrompt(): string {
  return [
    "Extraés HECHOS PERSONALES ESTABLES que una persona contó sobre sí misma en un chat con su asesor financiero.",
    'Devolvés SOLO un arreglo JSON: [{"fact": "...", "category": "..."}]. Sin texto alrededor. Si no hay ningún hecho que califique, devolvés [].',
    `category ∈ ${MEMORY_CATEGORIES.join(" | ")}.`,
    "",
    "SOLO extraés:",
    "- relaciones y familia (nombres de pareja, hijos, padres; con quién vive)",
    "- planes de vida declarados (mudarse, casarse, estudiar, tener hijos, jubilarse, cambiar de país)",
    "- preferencias y reglas propias declaradas explícitamente ('no toco el fondo de paz', 'prefiero no invertir en cripto')",
    "- trabajo y ocupación (a qué se dedica, dónde trabaja, si es independiente)",
    "- salud, solo si la persona la menciona como algo que condiciona sus decisiones",
    "",
    "NUNCA extraés:",
    "- CIFRAS de dinero de cualquier tipo: montos, saldos, ingresos, gastos, porcentajes, precios, metas en números. Ni una. Esos datos ya se leen en vivo de la base y una copia tuya quedaría desactualizada.",
    "- nada que haya dicho el ASISTENTE: solo cuenta lo que dijo la persona.",
    "- estados de ánimo o situaciones pasajeras ('hoy ando cansado', 'este mes me fue mal').",
    "- INFERENCIAS, interpretaciones o suposiciones. Solo lo dicho de forma explícita. Ante la menor duda, no lo incluyas.",
    "- preguntas, pedidos o instrucciones que la persona te hizo.",
    "",
    "Cada hecho es UNA frase corta, en tercera persona y en las palabras de la persona.",
    'Ejemplos válidos: {"fact":"Su esposa se llama Fernanda","category":"familia"} · {"fact":"Quiere mudarse a Escazú en 2027","category":"meta_vida"} · {"fact":"No usa el fondo de paz bajo ninguna circunstancia","category":"preferencia"}',
    `Máximo ${MAX_FACTS_PER_RUN} hechos. Preferí devolver menos y seguros.`,
  ].join("\n");
}

/**
 * El bloque de conversación que ve el extractor: SOLO los mensajes del usuario. El filtro es
 * ESTRUCTURAL, no una regla del prompt — así "nada dicho por el asistente" no depende de que el
 * modelo obedezca. Se acota el largo para que un día largo no infle la llamada.
 */
export function turnosParaExtractor(
  msgs: { role: "user" | "assistant"; content: string }[],
  maxChars = 6000,
): string {
  const lineas: string[] = [];
  let total = 0;
  // De atrás para adelante: si hay que recortar, sobrevive lo más reciente.
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== "user") continue;
    const linea = m.content.replace(/\s+/g, " ").trim();
    if (!linea) continue;
    if (total + linea.length > maxChars) break;
    total += linea.length;
    lineas.push(linea);
  }
  return lineas.reverse().join("\n");
}

function esCategoria(v: unknown): v is MemoryCategory {
  return typeof v === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Parsea la respuesta del extractor y aplica las guardas DURAS: forma válida, largo acotado,
 * categoría de la lista y —la que importa— fuera todo lo que tenga una cifra financiera.
 * Nunca lanza: una respuesta ilegible es simplemente "no hubo hechos hoy".
 */
export function parseExtractedFacts(raw: string): ExtractedFact[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ExtractedFact[] = [];
  for (const item of parsed) {
    if (out.length >= MAX_FACTS_PER_RUN) break;
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const fact = typeof rec.fact === "string" ? rec.fact.replace(/\s+/g, " ").trim() : "";
    if (fact.length < 3 || fact.length > MAX_FACT_LEN) continue;
    if (tieneCifraFinanciera(fact)) continue; // la guarda dura, por encima del prompt
    if (out.some((o) => esMismoHecho(o.fact, fact))) continue;
    out.push({ fact, category: esCategoria(rec.category) ? rec.category : "otro" });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// "Olvidá eso": carril determinista de baja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disparadores de "dejá de recordar esto". Acotados a propósito: "borrá el gasto de ayer" NO puede
 * caer acá (es una operación sobre el libro diario), así que un "borrá" suelto no dispara — tiene
 * que venir acompañado de una palabra de memoria.
 */
const OLVIDO_RES: RegExp[] = [
  // OJO con `\b` al final: en JS es un borde ASCII, así que después de una vocal acentuada
  // ("olvidá") NO hay borde y el patrón no matchearía nunca. Se cierra con un lookahead de "no letra".
  /\bolvid(?:a|á|ate|áte|alo|álo|ala|ála|en|emos)(?![\p{L}\p{N}])/iu,
  /\bno (?:te )?(?:recuerdes|acuerdes|guardes)(?![\p{L}\p{N}])/iu,
  /\b(?:borr|elimin|quit|sac)[aá](?![\p{L}\p{N}])[^.?!]{0,40}(?:memoria|recuerdos?|(?:lo )?que sab[eé]s|lo que record[aá]s)(?![\p{L}\p{N}])/iu,
  /\bdej[aá] de (?:recordar|acordarte)(?![\p{L}\p{N}])/iu,
  /\bno lo (?:recuerdes|guardes)(?![\p{L}\p{N}])/iu,
];

/** Pronombres/muletillas que no identifican NADA: "olvidá eso" no dice cuál hecho. */
const DEICTICOS = new Set(["eso", "esto", "aquello", "ese", "esa", "ultimo", "ultima"]);

/**
 * ¿El mensaje pide olvidar algo? Devuelve el TARGET en crudo (lo que dijo después del disparador),
 * o `""` cuando solo dijo "olvidá eso" sin identificar el hecho. `null` = no es un pedido de olvido.
 */
export function detectarPedidoDeOlvido(text: string): { target: string } | null {
  const t = text.trim();
  if (!t) return null;
  for (const re of OLVIDO_RES) {
    const m = re.exec(t);
    if (!m) continue;
    const resto = t
      .slice(m.index + m[0].length)
      .replace(/^[\s,:;]+/, "")
      .replace(/^(?:que|de|lo de|sobre|acerca de|el|la|los|las)\s+/i, "")
      .replace(/[.?!¡¿]+$/, "")
      .trim();
    const tokens = contentTokens(resto).filter((x) => !DEICTICOS.has(x));
    return { target: tokens.length > 0 ? resto : "" };
  }
  return null;
}

/**
 * Resuelve CUÁL hecho archivar. Con target: el que más tokens comparte (mínimo 1 — sin coincidencia
 * NO se adivina). Sin target ("olvidá eso"): el más reciente, que es a lo que se refiere en la
 * práctica. En los dos casos el hecho viaja a una tarjeta de confirmación con su texto a la vista:
 * el usuario ve exactamente qué se va a olvidar antes de tocar nada.
 */
export function resolverOlvido(target: string, activos: StoredFact[]): StoredFact | null {
  if (activos.length === 0) return null;
  const porFecha = [...activos].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
  );
  if (!target.trim()) return porFecha[0] ?? null;

  const tt = contentTokens(target);
  if (tt.length === 0) return porFecha[0] ?? null;

  let mejor: StoredFact | null = null;
  let mejorScore = 0;
  for (const f of porFecha) {
    const score = solapamiento(tt, contentTokens(f.fact));
    if (score > mejorScore) {
      mejorScore = score;
      mejor = f;
    }
  }
  return mejorScore >= 1 ? mejor : null;
}

/**
 * Las líneas que se inyectan al prompt. Tope duro `MAX_MEMORY_INJECTED` y recorte por hecho: el
 * prompt no puede crecer con la memoria del usuario.
 */
export function memoryLines(facts: StoredFact[], max = MAX_MEMORY_INJECTED): string[] {
  return facts.slice(0, max).map((f) => f.fact.replace(/\s+/g, " ").trim().slice(0, MAX_FACT_LEN));
}
