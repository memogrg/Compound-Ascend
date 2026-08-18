/**
 * Pure renderer: Discrepancy[] → Markdown. The table is
 * métrica | persona | oracle | app | Δ | Δ-modelo | veredicto, with a note column that
 * carries the "Δ = modelo conocido" vs "Δ > modelo" distinction for characterization.
 * `renderConsole` is the compact text dumped in full when a CRITICAL fires.
 */
import type { Discrepancy, Verdict } from "./types";

const ICON: Record<Verdict, string> = { ok: "✅", characterization: "⚠️", critical: "❌" };

const fmt = (n: number | null): string =>
  n === null ? "—" : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

function row(d: Discrepancy): string {
  return `| ${d.metric} | ${d.persona} | ${fmt(d.oracle)} | ${fmt(d.app)} | ${fmt(d.delta)} | ${fmt(d.expectedModelDiff)} | ${ICON[d.verdict]} ${d.verdict} | ${d.note} |`;
}

export interface ReportSummary {
  total: number;
  ok: number;
  characterization: number;
  critical: number;
}

export function summarize(ds: readonly Discrepancy[]): ReportSummary {
  return {
    total: ds.length,
    ok: ds.filter((d) => d.verdict === "ok").length,
    characterization: ds.filter((d) => d.verdict === "characterization").length,
    critical: ds.filter((d) => d.verdict === "critical").length,
  };
}

export function renderMd(ds: readonly Discrepancy[], opts: { generatedAt?: string } = {}): string {
  const s = summarize(ds);
  const lines: string[] = [];
  lines.push("# Oracle financiero · Reporte", "");
  lines.push(
    `**${s.critical}** críticos · **${s.characterization}** caracterización · **${s.ok}** identidades OK (${s.total} checks)` +
      (opts.generatedAt ? ` · generado ${opts.generatedAt}` : ""),
    "",
  );
  if (s.critical > 0) {
    lines.push("## ❌ Críticos (bloqueantes)", "");
    lines.push(TABLE_HEAD, TABLE_SEP);
    for (const d of ds.filter((x) => x.verdict === "critical")) lines.push(row(d));
    lines.push("");
  }
  lines.push("## Todos los checks", "");
  lines.push(TABLE_HEAD, TABLE_SEP);
  for (const d of ds) lines.push(row(d));
  lines.push("");
  lines.push(
    s.critical === 0
      ? "## Conclusión\n\nSin diferencias financieras críticas: las identidades núcleo (neto=activos−pasivos, composición, saco, sin doble conteo) se sostienen y ningún valor es NaN/Infinity. Las divergencias de caracterización son diferencias de modelo conocidas (ver columna Δ-modelo); se promueven a bloqueante en Fase 10 según lo que muestren los números."
      : `## Conclusión\n\n**${s.critical} diferencia(s) crítica(s)** — identidad rota o valor no finito. Bloqueante. Ver la sección de críticos arriba.`,
  );
  return lines.join("\n") + "\n";
}

const TABLE_HEAD = "| Métrica | Persona | Oracle | App | Δ | Δ-modelo | Veredicto | Nota |";
const TABLE_SEP = "|---|---|---:|---:|---:|---:|---|---|";

/** Compact full dump for the console when a CRITICAL fires. */
export function renderConsole(ds: readonly Discrepancy[]): string {
  const s = summarize(ds);
  const lines: string[] = [
    `[oracle] REPORTE COMPLETO — ${s.critical} críticos, ${s.characterization} caracterización, ${s.ok} OK`,
  ];
  for (const d of ds) {
    lines.push(
      `  ${ICON[d.verdict]} [${d.persona}] ${d.metric}: oracle=${fmt(d.oracle)} app=${fmt(d.app)} Δ=${fmt(d.delta)} Δmodelo=${fmt(d.expectedModelDiff)} — ${d.note}`,
    );
  }
  return lines.join("\n");
}
