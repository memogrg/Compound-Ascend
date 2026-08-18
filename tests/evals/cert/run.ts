/**
 * Orchestrates the whole AI audit: run each persona, aggregate outputs + findings,
 * cross-persona "generic" comparison (two personas must NOT get near-identical advice),
 * derive deterministic findings, and log the app-level snapshot clock-leak finding.
 */
import type { AIProvider } from "@/lib/ai/provider";
import { auditPersona } from "./runner";
import { selectPersonas } from "./personas";
import { compositeScore } from "./rubric";
import type { AuditOutput, Finding } from "./types";

export interface AuditResult {
  outputs: AuditOutput[];
  findings: Finding[];
}

export interface RunAuditOpts {
  nowStamp: number;
  provider: AIProvider;
  judge: AIProvider | undefined;
  personas?: string[];
  N?: number;
}

const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

/** Jaccard similarity of two replies' word sets. */
function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / (wa.size + wb.size - inter);
}

const GENERIC_SIM_THRESHOLD = 0.6;

export async function runAiAudit(opts: RunAuditOpts): Promise<AuditResult> {
  const personas = selectPersonas(opts.personas);
  const outputs: AuditOutput[] = [];
  const findings: Finding[] = [];
  const generics: AuditOutput[] = [];

  for (const persona of personas) {
    const r = await auditPersona(persona, {
      provider: opts.provider,
      judge: opts.judge,
      N: opts.N ?? 3,
      nowStamp: opts.nowStamp,
    });
    outputs.push(...r.outputs);
    findings.push(...r.findings);
    if (r.genericMonth6) generics.push(r.genericMonth6);
  }

  // Cross-persona GENERIC check: the same prompt to different personas must yield
  // personalized (different) advice.
  for (let i = 0; i < generics.length; i++) {
    for (let j = i + 1; j < generics.length; j++) {
      const gi = generics[i];
      const gj = generics[j];
      if (!gi || !gj) continue;
      const sim = similarity(gi.reply, gj.reply);
      if (sim >= GENERIC_SIM_THRESHOLD) {
        findings.push({
          kind: "generico",
          persona: `${gi.persona} vs ${gj.persona}`,
          detail: `Consejo genérico casi idéntico entre dos personas distintas (similitud ${Math.round(sim * 100)}%) — poca personalización.`,
        });
      }
    }
  }

  // Deterministic findings from every output.
  for (const o of outputs) {
    for (const c of o.contradictions) {
      findings.push({ kind: "contradiccion", persona: o.persona, detail: `[${o.suite}] ${c.kind}: ${c.detail}` });
    }
    if (!o.grounding.ok) {
      findings.push({
        kind: "grounding",
        persona: o.persona,
        detail: `[${o.suite}] cita cifras sin respaldo en el contexto: ${o.grounding.unmatched.join(", ")}`,
      });
    }
    if (o.suite === "longitudinal" && o.point === "mes6") {
      const temporal = o.rubric?.conciencia_temporal;
      if (temporal !== undefined && temporal < 2.5) {
        findings.push({
          kind: "temporal",
          persona: o.persona,
          detail: `Conciencia temporal baja a mes 6 (${temporal}/5): no refleja la trayectoria real.`,
        });
      }
    }
  }

  // App-level finding (surfaced during investigation, not exercised by the harness).
  findings.push({
    kind: "app-finding",
    persona: "—",
    detail:
      "Fuga de reloj: getPortfolioHistory ancla la ventana 6M con new Date() real (wealth/snapshot-service.ts:259). Bajo un timeline virtual lejano al now real, la trayectoria de portafolio del context-engine de PRODUCCIÓN se vaciaría silenciosamente. El harness lo bypassa capturando sus propios puntos.",
  });

  return { outputs, findings };
}

export { compositeScore };
