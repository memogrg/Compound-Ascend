/**
 * Pure renderer: AuditResult → Markdown. Rubric per output + stats (mean / worst-10 /
 * best-10) + finding lists (contradictions, grounding, generic, temporal, app) + the
 * fidelity caveat (what was REAL vs approximated). No secrets/PII in the output.
 */
import { SUBJECTIVE_DIMS, type AuditOutput, type FindingKind } from "./types";
import { compositeScore, computeStats } from "./rubric";
import type { AuditResult } from "./run";

const clip = (s: string, n = 180): string => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
};
const num = (n: number | null | undefined): string => (n == null ? "—" : String(n));

const FINDING_TITLE: Record<FindingKind, string> = {
  contradiccion: "❌ Contradicciones (evidencia dura)",
  grounding: "❌ Errores de grounding numérico",
  generico: "⚠️ Respuestas genéricas (poca personalización)",
  temporal: "⚠️ Fallos de conciencia temporal",
  "app-finding": "🔧 Hallazgos de la app / harness",
};

export interface AuditSummary {
  outputs: number;
  contradictions: number;
  grounding: number;
  generic: number;
  temporal: number;
}

export function summarize(res: AuditResult): AuditSummary {
  const f = res.findings;
  return {
    outputs: res.outputs.length,
    contradictions: f.filter((x) => x.kind === "contradiccion").length,
    grounding: f.filter((x) => x.kind === "grounding").length,
    generic: f.filter((x) => x.kind === "generico").length,
    temporal: f.filter((x) => x.kind === "temporal").length,
  };
}

function outputRow(o: AuditOutput): string {
  const comp = compositeScore(o);
  const flags = [
    o.contradictions.length ? `❌${o.contradictions.length}` : "",
    o.grounding.ok ? "" : "⚠grounding",
  ]
    .filter(Boolean)
    .join(" ");
  return `| ${o.persona} | ${o.suite}/${o.point} | ${num(comp)} | ${flags || "—"} | ${clip(o.reply, 120)} |`;
}

export function renderMd(res: AuditResult, opts: { generatedAt?: string } = {}): string {
  const s = summarize(res);
  const stats = computeStats(res.outputs, 10);
  const L: string[] = [];
  L.push("# Auditoría de IA · Reporte", "");
  L.push(
    `**${s.outputs}** outputs · **${s.contradictions}** contradicciones · **${s.grounding}** errores de grounding · ` +
      `**${s.generic}** genéricas · **${s.temporal}** fallos temporales` +
      (opts.generatedAt ? ` · generado ${opts.generatedAt}` : ""),
    "",
  );

  L.push("## Rúbrica (dimensiones subjetivas 0-5, juez fuerte, promedio N)", "");
  L.push(`Media global: **${stats.overallMean}** (${stats.count} outputs con rúbrica)`, "");
  L.push("| Dimensión | Media |", "|---|---:|");
  for (const d of SUBJECTIVE_DIMS) L.push(`| ${d} | ${stats.meanByDim[d]} |`);
  L.push("");

  L.push("### Peor-10", "", "| Persona | Suite | Score | Banderas | Respuesta |", "|---|---|---:|---|---|");
  for (const x of stats.worst) L.push(outputRow(x.output));
  L.push("", "### Mejor-10", "", "| Persona | Suite | Score | Banderas | Respuesta |", "|---|---|---:|---|---|");
  for (const x of stats.best) L.push(outputRow(x.output));
  L.push("");

  L.push("## Todos los outputs", "", "| Persona | Suite | Score | Banderas | Respuesta |", "|---|---|---:|---|---|");
  for (const o of res.outputs) L.push(outputRow(o));
  L.push("");

  // Evidencia sin truncar: texto COMPLETO de los outputs con bandera dura (contradicción o
  // grounding). Permite clasificar recomendación-fantasma real vs falso-positivo del regex.
  const flagged = res.outputs.filter((o) => o.contradictions.length || !o.grounding.ok);
  if (flagged.length) {
    L.push("## Texto completo · outputs marcados", "");
    for (const o of flagged) {
      const flags = o.contradictions.map((c) => `❌ ${c.kind}`).join(", ") || (o.grounding.ok ? "" : "⚠ grounding");
      L.push(`### ${o.persona} · ${o.suite}/${o.point} — ${flags}`, "");
      L.push("> " + o.reply.replace(/\s+/g, " ").trim(), "");
    }
  }

  L.push("## Hallazgos", "");
  const kinds: FindingKind[] = ["contradiccion", "grounding", "generico", "temporal", "app-finding"];
  for (const k of kinds) {
    const items = res.findings.filter((f) => f.kind === k);
    if (!items.length) continue;
    L.push(`### ${FINDING_TITLE[k]}`, "");
    for (const f of items) L.push(`- **${f.persona}**: ${f.detail}`);
    L.push("");
  }

  L.push("## Caveat de fidelidad del contexto", "");
  L.push(
    "El contexto pasado al asesor se RECONSTRUYE desde la BD de la persona sembrada (buildFinancialContext no es ctx-aware). Son **reales**: ingreso/gasto/flujo/tasa de ahorro, patrimonio neto, deudas, metas, portafolio, los 3 números @8%, la **trayectoria** (motor computeTrajectory sobre puntos capturados mes a mes) y el insight de ahorro bajo. Son **descriptores de persona** (constantes del harness, no del modelo): nombre, topConcern, lifeStage. Están **omitidos/aproximados**: indicadores macro (externos, iguales para todos) y la **biblia RAG** (recuperación de conocimiento). La certificación mide el razonamiento del asesor sobre datos reales con esa salvedad explícita.",
    "",
  );
  L.push(
    s.contradictions + s.grounding > 0
      ? "## Conclusión\n\nHay evidencia dura (contradicciones y/o errores de grounding) — ver arriba; son ❌ concretos, no opinión del juez."
      : "## Conclusión\n\nSin contradicciones ni errores de grounding en esta pasada. Las dimensiones subjetivas quedan en la rúbrica para revisión.",
  );
  return L.join("\n") + "\n";
}

export function renderConsole(res: AuditResult): string {
  const s = summarize(res);
  return `[ai-audit] ${s.outputs} outputs · ${s.contradictions} contradicciones · ${s.grounding} grounding · ${s.generic} genéricas · ${s.temporal} temporales`;
}
