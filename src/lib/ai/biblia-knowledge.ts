/**
 * Recuperación determinista de conocimiento conductual (la "Biblia"), sin
 * embeddings ni pgvector: un mapa curado por emoción dominante + tema del mensaje.
 * Puro y testeable. Devuelve hasta 3 fragmentos para no inflar el prompt.
 */

/** Guía por emoción dominante del usuario (del arquetipo). */
const EMOTION_RULES: Record<string, string> = {
  presion:
    "Está bajo presión: calma, explica poco a poco, muestra el próximo paso, sin alertas agresivas.",
  culpa: "Hay culpa: separa conducta de identidad, ofrece disfrute planificado, sin moralismo.",
  evasion: "Tiende a evitar: cero juicio, normaliza, recupera claridad con microacciones.",
  miedo:
    "Hay miedo: prioriza seguridad, fondo de emergencia y escenarios conservadores.",
  frustracion: "Frustración: da una acción de impacto rápido y una victoria temprana.",
  motivacion:
    "Aprovecha su motivación: retos y automatización antes de que baje la energía.",
  confusion: "Confusión: simplifica, ejemplos cotidianos, una cosa a la vez.",
  tranquilidad: "Tranquilo: tono estratégico, avanza hacia optimización y crecimiento.",
};

/**
 * Quita acentos y pasa a minúsculas para que el match tolere "inversión",
 * "INVERSION" e "inversion" por igual. Las keys del catálogo se guardan YA
 * normalizadas (sin acentos), así sólo hace falta normalizar el texto del usuario.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Fragmentos por tema, detectados por palabras clave (keys ya normalizadas). */
const TOPIC_CHUNKS: { keys: string[]; chunk: string }[] = [
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
const PATRIMONIO_GUIDANCE: Record<string, string> = {
  patrimonio_neto_negativo:
    "Patrimonio neto negativo: prioriza estabilizar deuda cara, flujo mensual y un fondo mínimo antes de invertir.",
  patrimonio_alto_baja_liquidez:
    "Patrimonio alto pero baja liquidez: construir liquidez y revisar concentración.",
  alto_pero_poco_productivo:
    "Patrimonio poco productivo: mostrar oportunidad de convertir activos dormidos en activos que generen ingreso.",
  alta_tasa_baja_proteccion:
    "Inviertes mucho pero con baja protección: fondo de emergencia y seguros antes de subir riesgo.",
  deuda_mala_alta:
    "Deuda mala alta: activar plan de deuda y limitar nuevos compromisos.",
  alta_concentracion: "Alta concentración: sugerir diversificación progresiva.",
  alto_gasto_vs_patrimonio:
    "Alto gasto frente al patrimonio: mostrar años de libertad y escenarios de ajuste.",
};

/** Mapea banderas patrimoniales (§15) a su guía. Máx 3, sin repetir, ignora desconocidas. */
export function selectPatrimonioGuidance(flags: string[]): string[] {
  const out: string[] = [];
  for (const f of flags) {
    if (out.length >= 3) break;
    const g = PATRIMONIO_GUIDANCE[f];
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

/** Selecciona la guía aplicable: 1 por emoción + hasta 2 por tema (máx 3). */
export function selectBibliaKnowledge(p: { emotion?: string; text?: string }): string[] {
  const out: string[] = [];
  if (p.emotion && EMOTION_RULES[p.emotion]) out.push(EMOTION_RULES[p.emotion]!);
  const text = normalize(p.text ?? "");
  let topics = 0;
  for (const t of TOPIC_CHUNKS) {
    if (topics >= 2) break;
    if (t.keys.some((k) => text.includes(k))) {
      out.push(t.chunk);
      topics++;
    }
  }
  return out; // máx 3 fragmentos → no infla el prompt
}
