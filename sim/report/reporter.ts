/**
 * Pure reporter: RunResult[] → self-contained HTML + executive Markdown. No DB, no
 * fs, no network. Deterministic (seed-stable): the only non-stable value is the
 * optional `generatedAt` header. The HTML embeds inline SVG charts and its own CSS,
 * so it renders offline with no CDN.
 */
import type { EventLog, LogEntry } from "../event-log";
import type { Finding, RunResult } from "./types";
import { COVERAGE_FEATURES, coverageOf, coverageCount } from "./coverage";
import { lineChart, fmtNum, escapeText } from "./charts";
import { HISTORICAL_FINDINGS, statusFinding } from "./findings";

const CSS = `
:root{--bg:#0f1220;--panel:#171a2b;--ink:#e7e9f3;--muted:#9aa0b4;--grid:#333852;--line:#2a2e44;--pos:#37d67a;--neg:#ff5964;--acc:#5b8cff;--acc2:#f5a623}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:24px 28px;border-bottom:1px solid var(--line)}
h1{margin:0 0 4px;font-size:22px}h2{font-size:18px;margin:28px 0 12px}h3{font-size:15px;margin:18px 0 8px}
.sub{color:var(--muted)}
section{padding:0 28px}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600}
.pill.ok{background:rgba(55,214,122,.16);color:var(--pos)}
.pill.bad{background:rgba(255,89,100,.16);color:var(--neg)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:14px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.kpi .v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}.kpi .k{color:var(--muted);font-size:12px}
.chart{width:100%;height:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;margin:8px 0}
.chart .tick{fill:var(--muted);font-size:11px}
.matrix td.yes{color:var(--pos);text-align:center}.matrix td.no{color:var(--muted);text-align:center}
.matrix th.rot{font-size:11px;color:var(--muted);white-space:nowrap}
details{margin:8px 0}summary{cursor:pointer;color:var(--acc)}
.ev{color:var(--muted);font-size:13px;margin:2px 0}
.finding{border-left:3px solid var(--line);padding:6px 12px;margin:8px 0}
.finding.bugfixed{border-color:var(--acc)}.finding.discrepancy{border-color:var(--acc2)}.finding.clean{border-color:var(--pos)}
`;

function statusPill(fail: number): string {
  return fail === 0 ? `<span class="pill ok">verde</span>` : `<span class="pill bad">${fail} rojo</span>`;
}

function renderIndex(runs: RunResult[]): string {
  const rows = runs
    .map((r) => {
      const pass = r.log.checks.length - r.log.failures.length;
      return (
        `<tr><th><a href="#${escapeText(r.persona)}">${escapeText(r.displayName)}</a></th>` +
        `<td>${statusPill(r.log.failures.length)}</td>` +
        `<td class="num">${r.series.length}</td>` +
        `<td class="num">${r.log.checks.length}</td>` +
        `<td class="num">${pass}/${r.log.failures.length}</td>` +
        `<td class="num">${coverageCount(r.log)}/${COVERAGE_FEATURES.length}</td></tr>`
      );
    })
    .join("");
  return (
    `<section><h2>Índice</h2><table><thead><tr><th>Persona</th><th>Estado</th>` +
    `<th class="num">Meses</th><th class="num">Checks</th><th class="num">Pass/Fail</th><th class="num">Cobertura</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></section>`
  );
}

function groupChecks(log: EventLog): Map<string, { pass: number; fail: number }> {
  const groups = new Map<string, { pass: number; fail: number }>();
  for (const c of log.checks) {
    const grp = c.name.split(" · ")[0] ?? c.name;
    const g = groups.get(grp) ?? { pass: 0, fail: 0 };
    if (c.ok) g.pass += 1;
    else g.fail += 1;
    groups.set(grp, g);
  }
  return groups;
}

function renderTimeline(log: EventLog): string {
  const byMonth = new Map<number, LogEntry[]>();
  for (const e of log.entries) {
    if (e.kind !== "event") continue;
    const mo = e.day === null ? 0 : Math.floor(e.day / 100);
    const arr = byMonth.get(mo) ?? [];
    arr.push(e);
    byMonth.set(mo, arr);
  }
  const months = [...byMonth.keys()].sort((a, b) => a - b);
  const blocks = months
    .map((mo) => {
      const items = (byMonth.get(mo) ?? [])
        .map((e) => {
          const amount = typeof e.detail?.["amount"] === "number" ? ` · ${fmtNum(e.detail["amount"] as number)}` : "";
          return `<div class="ev">· ${escapeText(e.label)}${amount}</div>`;
        })
        .join("");
      return `<h3>Mes ${mo === 0 ? "0 (setup)" : mo}</h3>${items}`;
    })
    .join("");
  return `<details><summary>Timeline de eventos por mes</summary>${blocks}</details>`;
}

function renderPersona(r: RunResult): string {
  const last = r.series[r.series.length - 1];
  const months = r.series.map((p) => p.month);
  const kpis = last
    ? `<div class="grid">` +
      kpi("Patrimonio neto", last.netWorth) +
      kpi("Liquidez", last.liquidity) +
      kpi("Inversiones", last.portfolio) +
      kpi("Metas", last.goals) +
      kpi("Deudas", last.debts) +
      `</div>`
    : `<p class="sub">Sin serie mensual.</p>`;

  const chart = r.series.length
    ? lineChart(
        months,
        [
          { name: "Patrimonio neto", values: r.series.map((p) => p.netWorth), color: "var(--acc)" },
          { name: "Liquidez", values: r.series.map((p) => p.liquidity), color: "var(--pos)" },
          { name: "Inversiones", values: r.series.map((p) => p.portfolio), color: "var(--acc2)" },
        ],
        `Evolución · ${r.displayName}`,
      )
    : "";

  const checkGroups = [...groupChecks(r.log).entries()]
    .map(
      ([g, v]) =>
        `<tr><th>${escapeText(g)}</th><td class="num">${v.pass}</td><td class="num">${v.fail}</td>` +
        `<td>${v.fail === 0 ? statusPill(0) : statusPill(v.fail)}</td></tr>`,
    )
    .join("");

  return (
    `<section id="${escapeText(r.persona)}"><h2>${escapeText(r.displayName)} ${statusPill(r.log.failures.length)}</h2>` +
    `<div class="card">${kpis}</div>` +
    chart +
    `<h3>Checks por grupo</h3><table><thead><tr><th>Grupo</th><th class="num">Pass</th><th class="num">Fail</th><th>Estado</th></tr></thead><tbody>${checkGroups}</tbody></table>` +
    renderTimeline(r.log) +
    `</section>`
  );
}

function kpi(k: string, v: number): string {
  return `<div class="kpi"><div class="v">${fmtNum(v)}</div><div class="k">${escapeText(k)}</div></div>`;
}

function renderCoverageMatrix(runs: RunResult[]): string {
  const head = COVERAGE_FEATURES.map((f) => `<th class="rot">${f}</th>`).join("");
  const rows = runs
    .map((r) => {
      const seen = coverageOf(r.log);
      const cells = COVERAGE_FEATURES.map(
        (f) => `<td class="${seen.has(f) ? "yes" : "no"}">${seen.has(f) ? "✓" : "·"}</td>`,
      ).join("");
      return `<tr><th>${escapeText(r.displayName)}</th>${cells}</tr>`;
    })
    .join("");
  return (
    `<section><h2>Matriz de cobertura de features</h2><table class="matrix"><thead><tr><th>Persona</th>${head}</tr></thead>` +
    `<tbody>${rows}</tbody></table></section>`
  );
}

function renderFindings(findings: Finding[]): string {
  const items = findings
    .map(
      (f) =>
        `<div class="finding ${f.kind === "bug-fixed" ? "bugfixed" : f.kind}">` +
        `<strong>${escapeText(f.title)}</strong>${f.ref ? ` <span class="sub">(${escapeText(f.ref)})</span>` : ""}` +
        `<div class="sub">${escapeText(f.detail)}</div></div>`,
    )
    .join("");
  return `<section><h2>Hallazgos</h2>${items}</section>`;
}

export function renderHtml(runs: RunResult[], opts: { generatedAt?: string } = {}): string {
  const findings = [statusFinding(runs), ...HISTORICAL_FINDINGS];
  const totalChecks = runs.reduce((s, r) => s + r.log.checks.length, 0);
  const totalFail = runs.reduce((s, r) => s + r.log.failures.length, 0);
  const gen = opts.generatedAt ? `<span class="sub"> · generado el ${escapeText(opts.generatedAt)}</span>` : "";

  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Simulador · Reporte</title><style>${CSS}</style></head><body>` +
    `<header><h1>Simulador (gemelo digital) · Reporte</h1>` +
    `<div class="sub">${runs.length} personas · ${totalChecks} checks · ${totalFail} fallas${gen}</div></header>` +
    renderIndex(runs) +
    renderCoverageMatrix(runs) +
    runs.map(renderPersona).join("") +
    renderFindings(findings) +
    `</body></html>`
  );
}

export function renderMd(runs: RunResult[]): string {
  const findings = [statusFinding(runs), ...HISTORICAL_FINDINGS];
  const lines: string[] = [];
  lines.push("# Simulador (gemelo digital) · Reporte ejecutivo", "");
  lines.push("| Persona | Meses | Checks | Pass | Fail | Cobertura |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const r of runs) {
    const pass = r.log.checks.length - r.log.failures.length;
    lines.push(
      `| ${r.displayName} | ${r.series.length} | ${r.log.checks.length} | ${pass} | ${r.log.failures.length} | ${coverageCount(r.log)}/${COVERAGE_FEATURES.length} |`,
    );
  }
  lines.push("", "## Hallazgos", "");
  for (const f of findings) {
    lines.push(`- **${f.title}**${f.ref ? ` (${f.ref})` : ""}: ${f.detail}`);
  }
  const totalChecks = runs.reduce((s, r) => s + r.log.checks.length, 0);
  const totalFail = runs.reduce((s, r) => s + r.log.failures.length, 0);
  lines.push("", "## Conclusión", "");
  lines.push(
    totalFail === 0
      ? `El simulador ejercitó ${runs.length} personas sobre una ventana multi-mes con ${totalChecks} verificaciones de invariantes (liquidez, flujo, metas, patrimonio, vinculadas, evolución y DCA) y **0 fallas**. En el camino cazó y cerró 3 bugs de producción y caracterizó una discrepancia conocida (#655) — el arnés funciona como red de seguridad viva, no solo como test.`
      : `El simulador reportó ${totalFail} verificación(es) en rojo sobre ${totalChecks}. Revisá el detalle por persona en el HTML.`,
  );
  return lines.join("\n") + "\n";
}
