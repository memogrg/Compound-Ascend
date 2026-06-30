/**
 * Corpus de la "Biblia" conductual: DATA cruda (sin IO) compartida por la recuperación
 * keyword (biblia-knowledge.ts) y por el sembrado semántico (biblia_chunks + embeddings).
 *
 * Fase 2b-1: este módulo extrae los datos para poder MIGRARLOS a pgvector sin cambiar todavía
 * la recuperación. El comportamiento keyword de biblia-knowledge se mantiene idéntico.
 */

export type TopicChunk = { keys: string[]; chunk: string };

/** Guía por emoción dominante del usuario (del arquetipo). */
export const EMOTION_RULES: Record<string, string> = {
  presion:
    "Está bajo presión: calma, explica poco a poco, muestra el próximo paso, sin alertas agresivas.",
  culpa: "Hay culpa: separa conducta de identidad, ofrece disfrute planificado, sin moralismo.",
  evasion: "Tiende a evitar: cero juicio, normaliza, recupera claridad con microacciones.",
  miedo: "Hay miedo: prioriza seguridad, fondo de emergencia y escenarios conservadores.",
  frustracion: "Frustración: da una acción de impacto rápido y una victoria temprana.",
  motivacion:
    "Aprovecha su motivación: retos y automatización antes de que baje la energía.",
  confusion: "Confusión: simplifica, ejemplos cotidianos, una cosa a la vez.",
  tranquilidad: "Tranquilo: tono estratégico, avanza hacia optimización y crecimiento.",
};

/** Fragmentos por tema, detectados por palabras clave (keys ya normalizadas). */
export const TOPIC_CHUNKS: TopicChunk[] = [
  {
    keys: ["invertir", "inversion", "acciones", "bolsa", "cripto", "etf"],
    chunk:
      "Inversión: pregunta horizonte, liquidez y reacción ante pérdidas; explica el riesgo como rango de escenarios (no certeza); aportes graduales y automáticos; nada de rendimientos garantizados.",
  },
  {
    keys: ["deuda", "deudas", "prestamo", "tarjeta", "credito"],
    chunk:
      "Deuda: ataca primero la más cara (mayor interés), busca victorias visibles, sin culpa ni regaños.",
  },
  {
    keys: ["ahorr"],
    chunk:
      "Ahorro: conviértelo en sistema — automatiza, microhábitos y celebra avances pequeños; no dependas de fuerza de voluntad.",
  },
  {
    keys: ["fomo", "oportunidad", "no perder", "todos", "viral", "ahora o nunca"],
    chunk:
      "FOMO: fricción positiva (pausa, escenarios, riesgo, alternativas); una buena racha no es habilidad.",
  },
  {
    keys: ["comparar", "otros", "redes", "voy tarde", "atrasad"],
    chunk:
      "Comparación social: redirige a sus propias metas y a su progreso vs. su pasado; nunca compares con otros usuarios.",
  },
  {
    keys: ["gastar", "comprar", "compra", "antojo", "impulso", "capricho"],
    chunk:
      "Gasto impulsivo: nudge de pausa y costo anual; conéctalo con su meta principal, sin moralizar.",
  },
  {
    keys: ["retiro", "jubil", "pension"],
    chunk:
      "Retiro: proyecta escenarios (conservador/base/acelerado) conectados con su Rich Life de largo plazo.",
  },
  {
    keys: ["emergencia", "imprevisto", "seguro", "proteccion"],
    chunk:
      "Protección: prioriza base (fondo de emergencia, seguros) antes de estrategias de crecimiento.",
  },
  // ---- Temas frecuentes de CR/LatAm (keys ya normalizadas, sin acentos) ----
  {
    keys: ["plazo fijo", "cdp", "certificado", "deposito a plazo"],
    chunk:
      "Renta fija (plazo fijo, CDP): segura y predecible, pero compará su rendimiento contra la inflación; sirve para liquidez y corto plazo, no para crecer patrimonio a largo plazo.",
  },
  {
    keys: ["bono", "bonos", "deuda soberana"],
    chunk:
      "Bonos: cuando la tasa sube, el precio del bono baja; pesa también el riesgo del emisor; conectá con tu horizonte y liquidez, sin casarte con un emisor puntual.",
  },
  {
    keys: ["fondo de inversion", "fondos", "fondo inmobiliario"],
    chunk:
      "Fondos de inversión: diversifican y los gestiona un tercero; revisá las comisiones y que calcen con tu perfil y horizonte; sin recomendar un fondo concreto.",
  },
  {
    keys: ["impuesto", "impuestos", "hacienda", "renta", "tributacion"],
    chunk:
      "Impuestos: te oriento en general, pero validá tu caso con un contador; no tomes una respuesta fiscal puntual como certeza.",
  },
  {
    keys: ["rop", "pension", "pensiones", "jubilacion"],
    chunk:
      "Pensión (ROP): aportes consistentes y horizonte largo; conectalo con tu Número de Libertad y escenarios, sin prometer montos.",
  },
  {
    keys: ["dolar", "dolares", "colones", "tipo de cambio", "divisa"],
    chunk:
      "Moneda: decidí por la moneda de tus metas y gastos, no por especular; tené presente el riesgo cambiario.",
  },
  {
    keys: ["sinpe", "transferencia"],
    chunk:
      "SINPE: útil para automatizar ahorro y pagos; es un medio de transferencia, no una inversión.",
  },
];

/**
 * Reglas §15 del Marco Patrimonial: cada código de banderas de
 * buildPatrimonioDiagnosis → su acción del PDF. Códigos desconocidos se ignoran.
 */
export const PATRIMONIO_GUIDANCE: Record<string, string> = {
  patrimonio_neto_negativo:
    "Patrimonio neto negativo: prioriza estabilizar deuda cara, flujo mensual y un fondo mínimo antes de invertir.",
  patrimonio_alto_baja_liquidez:
    "Patrimonio alto pero baja liquidez: construir liquidez y revisar concentración.",
  alto_pero_poco_productivo:
    "Patrimonio poco productivo: mostrar oportunidad de convertir activos dormidos en activos que generen ingreso.",
  alta_tasa_baja_proteccion:
    "Inviertes mucho pero con baja protección: fondo de emergencia y seguros antes de subir riesgo.",
  deuda_mala_alta: "Deuda mala alta: activar plan de deuda y limitar nuevos compromisos.",
  alta_concentracion: "Alta concentración: sugerir diversificación progresiva.",
  alto_gasto_vs_patrimonio:
    "Alto gasto frente al patrimonio: mostrar años de libertad y escenarios de ajuste.",
};

/** Una entrada del corpus para sembrar en biblia_chunks (tag + texto). */
export type BibliaSeedEntry = { tag: string; content: string };

/**
 * Corpus curado aplanado para el sembrado semántico. tag: "tema" | "emocion" | "patrimonio".
 * Es la MISMA data que usa la recuperación keyword — el embedding se calcula al sembrar.
 */
export const BIBLIA_SEED_ENTRIES: BibliaSeedEntry[] = [
  ...TOPIC_CHUNKS.map((t) => ({ tag: "tema", content: t.chunk })),
  ...Object.values(EMOTION_RULES).map((content) => ({ tag: "emocion", content })),
  ...Object.values(PATRIMONIO_GUIDANCE).map((content) => ({ tag: "patrimonio", content })),
];

const CHUNK_MAX = 1200; // cap por chunk (incluye el prefijo de encabezados)
const MIN_CHUNK = 40; // descartar fragmentos demasiado cortos (encabezados sueltos, ruido)
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/; // ATX markdown: #, ##, ###…

/** Parte un párrafo largo por oraciones (. ! ?), acumulando sin pasar `max` ni cortar a media oración. */
function splitSentences(paragraph: string, max: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [paragraph];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (buf && buf.length + 1 + piece.length > max) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf} ${piece}` : piece;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Chunking de texto plano (sin encabezados): corta por párrafos (líneas en blanco), acumula los
 * pequeños y divide por oraciones los párrafos que superan `max`. Nunca corta a media oración.
 */
function chunkPlainText(text: string, max: number): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };
  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > max ? splitSentences(paragraph, max) : [paragraph];
    for (const piece of pieces) {
      if (buf && buf.length + 2 + piece.length > max) flush();
      buf = buf ? `${buf}\n\n${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

type Section = { path: string[]; body: string };

/**
 * Parte un markdown en secciones por encabezados ATX, arrastrando la RUTA de encabezados
 * (stack por nivel) como contexto. Los encabezados huérfanos (sin cuerpo) no emiten sección: su
 * título queda en la ruta de la sección siguiente (se fusionan con su contenido).
 */
function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; title: string }[] = [];
  let path: string[] = [];
  let body: string[] = [];
  const flush = () => {
    const b = body.join("\n").trim();
    if (b) sections.push({ path: [...path], body: b });
    body = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush(); // cierra la sección previa con su ruta actual
      const level = m[1]!.length;
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, title: m[2]!.trim() });
      path = stack.map((s) => s.title);
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Parte un documento en chunks (~1200 chars) para ingestar al corpus. Heading-aware: respeta los
 * encabezados markdown y antepone la ruta de encabezados ("H1 > H2 > H3") como contexto en cada
 * chunk de su sección; fusiona encabezados huérfanos; descarta fragmentos < MIN_CHUNK. Para
 * documentos sin encabezados se comporta como el chunker plano (compat con el uso actual).
 */
export function chunkDocument(text: string): string[] {
  const sections = parseSections(text);
  const hasHeadings = sections.some((s) => s.path.length > 0);
  if (!hasHeadings) {
    return chunkPlainText(text, CHUNK_MAX).filter((c) => c.length >= MIN_CHUNK);
  }
  const out: string[] = [];
  for (const section of sections) {
    const prefix = section.path.join(" > ");
    const budget = Math.max(CHUNK_MAX - prefix.length - 2, 300); // deja lugar para el prefijo
    for (const bodyChunk of chunkPlainText(section.body, budget)) {
      const chunk = prefix ? `${prefix}\n\n${bodyChunk}` : bodyChunk;
      if (chunk.length >= MIN_CHUNK) out.push(chunk);
    }
  }
  return out;
}
