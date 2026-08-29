/**
 * PUNTAJE DEL BANCO DE AUDITORÍA — el motor PURO (sin IO, sin red: testeable entero).
 *
 * El harness (`scripts/chat-audit.ts`) corre ~130 preguntas contra el chat real y junta, por
 * respuesta: heurísticas de regex, los cinco ejes del juez LLM y los asserts de fixture. Todo lo
 * que DECIDE (qué es un fail, cuánto vale la corrida, si mejoró o empeoró) vive acá, para que se
 * pueda probar sin servidor, sin Supabase y sin proveedor.
 *
 * DÓNDE ESTÁ EL HARNESS: todavía no en `main` — vive en la rama `chore/chat-audit-harness`, que es
 * con la que se corrieron las auditorías de producción. Este módulo es la versión extraída de su
 * `isFail()` local, ya con puntaje y comparación entre corridas; cuando esa rama se integre, el
 * harness tiene que importar de acá en vez de decidir por su cuenta, o van a existir dos
 * definiciones de "falla" que se van a separar sin que nadie se entere.
 *
 * ── LAS FRASES DE CULPA SON FAIL AUTOMÁTICO ─────────────────────────────────
 * No es un eje más del juez ni un puntaje bajo: es un corte. El producto entero se apoya en que el
 * asesor NO REGAÑA — es lo que separa a este asesor de una app de presupuesto con alertas rojas, y
 * una persona que se siente juzgada por su plata deja de abrir la app. Un juez LLM promedia y puede
 * dejar pasar un "deberías haber..." con 4/5 en tono. La detección es determinista y el fail no se
 * negocia: si la frase está, la respuesta falla, sin importar qué tan buena sea el resto.
 */

/**
 * Patrones de CULPA / REPROCHE. Cada uno es una forma real en que un asesor financiero regaña.
 * Deliberadamente estrechos: prefieren dejar pasar un caso dudoso a marcar un falso positivo, porque
 * un fail automático que se dispara mal hace que se ignore la métrica entera.
 */
const CULPA_RES: { nombre: string; re: RegExp }[] = [
  // "deberías haber ahorrado", "tenías que haber pagado" — el reproche por lo que ya no se puede cambiar.
  {
    nombre: "deberias_haber",
    re: /\b(deber[íi]as?|ten[íi]as? que|hubieras?|habr[íi]as? debido)\s+(?:haber\s+)?\w+/i,
  },
  // "te lo dije", "ya te había advertido", "ya te avisé".
  //
  // Cierra con `(?!\p{L})` y flag `u`, NO con `\b`: `\b` se define sobre [A-Za-z0-9_], así que una
  // vocal acentuada no es \w y el límite pegado a ella no se cumple nunca — con el `\b` de cierre,
  // "te lo advertí" y "ya te avisé" eran alternativas MUERTAS, no matcheaban jamás. Cubre también
  // los participios ("advertido", "avisado", "dicho"), que es como se reprocha de verdad.
  {
    nombre: "te_lo_dije",
    re: /\b(?:te lo|ya te)\s+(?:hab[íi]a\s+)?(?:dije|dicho|advert(?:[íi]|ido)|avis(?:[eé]|ado))(?!\p{L})/iu,
  },
  // Juicio moral sobre la persona o su conducta.
  {
    nombre: "juicio_moral",
    re: /\b(irresponsable|imprudente|descuidad[oa]|indisciplinad[oa]|mal gastad[oa]|derrochador[a]?|despilfarr\w+)\b/i,
  },
  // "otra vez", "de nuevo" acompañando un gasto: el señalamiento de reincidencia.
  {
    nombre: "reincidencia",
    re: /\b(otra vez|de nuevo|nuevamente|una vez m[áa]s)\b[^.!?\n]{0,40}\b(gast\w+|te pasaste|excediste|sobregir\w+)/i,
  },
  // Decepción explícita del asesor.
  {
    nombre: "decepcion",
    re: /\b(me decepcion\w+|es una l[áa]stima que|qu[eé] pena que (?:no )?(?:hayas|hubieras))\b/i,
  },
  // Imperativo de disciplina en tono de reto ("tenés que dejar de", "parale a").
  {
    nombre: "reto",
    re: /\b(ten[ée]s que dejar de|dej[áa] de (?:gastar|derrochar)|control[áa]te|más disciplina te hace falta)\b/i,
  },
];

/** Las frases de culpa encontradas, por nombre de patrón. Vacío = la respuesta no regaña. */
export function frasesDeCulpa(reply: string): string[] {
  if (!reply.trim()) return [];
  return CULPA_RES.filter((c) => c.re.test(reply)).map((c) => c.nombre);
}

/** `true` si la respuesta regaña. Fail automático, sin importar el resto del puntaje. */
export function tieneCulpa(reply: string): boolean {
  return frasesDeCulpa(reply).length > 0;
}

/** Un flag de la auditoría (heurística o assert de fixture). */
export type Flag = { type: string; detail: string };

/** Los cinco ejes del juez, 1-5. */
export type JudgeScore = {
  answered: number;
  concise: number;
  currency_ok: number;
  no_hallucination: number;
  advisor_tone: number;
  fail: boolean;
  reason: string;
};

/** Una fila auditada, ya con todo lo que hace falta para decidir si pasa. */
export type AuditedRow = {
  id: string;
  category: string;
  question: string;
  reply: string;
  status: number;
  latencyMs: number;
  error?: string;
  lane: "determinista" | "llm" | "?";
  flags: Flag[];
  judge: JudgeScore | null;
};

/**
 * Tipos de flag que hacen fallar la respuesta. Los que faltan (`flooding`, `inconsistencia`) son
 * señales de calidad que se reportan pero no tumban la corrida: son ruidosos y no son incorrectos.
 */
const FLAGS_GRAVES: ReadonlySet<string> = new Set([
  "sin_ia",
  "moneda",
  "cero",
  "no_se_con_dato",
  "alucinacion",
  "arrastre",
  "cifra",
  "fuera_tema",
  "error",
  "culpa",
]);

/** Por qué falló una fila. `null` = pasó. Devuelve la causa para poder contar por tipo. */
export function causaDeFallo(row: AuditedRow): string | null {
  // 1. La culpa manda: se evalúa ANTES que todo lo demás y no la puede rescatar ningún puntaje.
  if (tieneCulpa(row.reply)) return "culpa";
  if (row.error) return "error";
  if (row.status >= 500) return "error";
  const grave = row.flags.find((f) => FLAGS_GRAVES.has(f.type));
  if (grave) return grave.type;
  if (row.judge?.fail) return "juez";
  return null;
}

export type RunScore = {
  total: number;
  pass: number;
  /** 0..100 — el % de respuestas que pasan. Es el número que se compara entre corridas. */
  score: number;
  /** Promedio de cada eje del juez sobre las filas que tuvieron juez. */
  juez: Record<string, number>;
  /** Conteo por causa de fallo: dice QUÉ empeoró, no solo que empeoró. */
  fallas: Record<string, number>;
  failsCulpa: number;
  latP50: number | null;
  latP95: number | null;
  /** % de respuestas que resolvió un carril determinista (cobertura del router en el banco). */
  coberturaDet: number | null;
};

function percentil(xs: number[], p: number): number | null {
  const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (s.length === 0) return null;
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!);
}

const EJES = ["answered", "concise", "currency_ok", "no_hallucination", "advisor_tone"] as const;

/** Puntúa una corrida completa. Puro: mismas filas ⇒ mismo score, siempre. */
export function scoreRun(rows: AuditedRow[]): RunScore {
  const fallas: Record<string, number> = {};
  let pass = 0;
  let failsCulpa = 0;
  let conJuez = 0;
  const sumaEjes: Record<string, number> = {};
  const lat: number[] = [];
  let det = 0;
  let conCarril = 0;

  for (const r of rows) {
    const causa = causaDeFallo(r);
    if (causa === null) pass += 1;
    else {
      fallas[causa] = (fallas[causa] ?? 0) + 1;
      if (causa === "culpa") failsCulpa += 1;
    }
    if (r.latencyMs > 0) lat.push(r.latencyMs);
    if (r.lane !== "?") {
      conCarril += 1;
      if (r.lane === "determinista") det += 1;
    }
    if (r.judge) {
      conJuez += 1;
      for (const eje of EJES) sumaEjes[eje] = (sumaEjes[eje] ?? 0) + (r.judge[eje] ?? 0);
    }
  }

  const juez: Record<string, number> = {};
  if (conJuez > 0)
    for (const eje of EJES) juez[eje] = Math.round(((sumaEjes[eje] ?? 0) / conJuez) * 100) / 100;

  return {
    total: rows.length,
    pass,
    score: rows.length === 0 ? 0 : Math.round((pass / rows.length) * 10000) / 100,
    juez,
    fallas,
    failsCulpa,
    latP50: percentil(lat, 50),
    latP95: percentil(lat, 95),
    coberturaDet: conCarril === 0 ? null : Math.round((det / conCarril) * 1000) / 10,
  };
}

export type Comparacion = {
  /** Puntos porcentuales de diferencia contra la corrida anterior. */
  deltaScore: number;
  veredicto: "mejoró" | "empeoró" | "igual";
  /** Causas que aparecieron o crecieron, y cuánto. Es lo accionable de la comparación. */
  empeoraron: { causa: string; antes: number; ahora: number }[];
  mejoraron: { causa: string; antes: number; ahora: number }[];
  /** Regresión de culpa: pasar de 0 a ≥1 es lo más grave que puede reportar la comparación. */
  regresionCulpa: boolean;
};

/** Umbral bajo el cual un cambio de score es ruido del juez, no una señal. */
const RUIDO_PP = 1.5;

/**
 * Compara dos corridas. El veredicto usa un umbral porque el juez LLM tiene ruido propio: mover
 * medio punto entre dos corridas no significa nada, y llamarlo "empeoró" entrena a ignorar la
 * alarma. La REGRESIÓN DE CULPA no tiene umbral — pasar de cero a uno siempre importa.
 */
export function compararCorridas(ahora: RunScore, antes: RunScore | null): Comparacion | null {
  if (!antes) return null;
  const deltaScore = Math.round((ahora.score - antes.score) * 100) / 100;
  const causas = new Set([...Object.keys(ahora.fallas), ...Object.keys(antes.fallas)]);
  const empeoraron: Comparacion["empeoraron"] = [];
  const mejoraron: Comparacion["mejoraron"] = [];
  for (const causa of causas) {
    const a = antes.fallas[causa] ?? 0;
    const b = ahora.fallas[causa] ?? 0;
    if (b > a) empeoraron.push({ causa, antes: a, ahora: b });
    else if (b < a) mejoraron.push({ causa, antes: a, ahora: b });
  }
  empeoraron.sort((x, y) => y.ahora - y.antes - (x.ahora - x.antes));
  mejoraron.sort((x, y) => x.ahora - x.antes - (y.ahora - y.antes));
  return {
    deltaScore,
    veredicto: Math.abs(deltaScore) < RUIDO_PP ? "igual" : deltaScore > 0 ? "mejoró" : "empeoró",
    empeoraron,
    mejoraron,
    regresionCulpa: antes.failsCulpa === 0 && ahora.failsCulpa > 0,
  };
}

/** Resumen de una línea para la consola del CI y el cuerpo del reporte. */
export function resumenComparacion(ahora: RunScore, cmp: Comparacion | null): string {
  const base = `score ${ahora.score.toFixed(1)}% (${ahora.pass}/${ahora.total})`;
  if (!cmp) return `${base} — primera corrida, sin comparación`;
  const signo = cmp.deltaScore > 0 ? "+" : "";
  const culpa = cmp.regresionCulpa ? " · ⚠ REGRESIÓN DE CULPA: el asesor volvió a regañar" : "";
  const peor = cmp.empeoraron.length
    ? ` · empeoró: ${cmp.empeoraron.map((e) => `${e.causa} ${e.antes}→${e.ahora}`).join(", ")}`
    : "";
  return `${base} · ${cmp.veredicto} ${signo}${cmp.deltaScore.toFixed(1)}pp${culpa}${peor}`;
}
