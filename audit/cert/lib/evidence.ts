/**
 * Evidence capture + per-journey reporting. Screenshots of key states go to
 * audit/evidence/<runId>/<project>/NN-<label>.png (always, not only on failure); each
 * test writes a small result JSON, and the cleanup project compiles them into
 * report.md + report.json. All under audit/evidence/ (gitignored).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { ensureDir, runDir } from "./context";

export interface CheckLine {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface JourneyResult {
  project: string;
  surface: string;
  title: string;
  status: string;
  shots: string[];
  checks: CheckLine[];
}

const slug = (s: string): string => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
const pad = (n: number): string => String(n).padStart(2, "0");

/** One instance per test; collects screenshots + checks, flushed on teardown. */
export class Evidence {
  private n = 0;
  private readonly shots: string[] = [];
  private readonly checks: CheckLine[] = [];
  private readonly dir: string;

  constructor(
    private readonly runId: string,
    private readonly project: string,
    private readonly surface: string,
    private readonly title: string,
  ) {
    this.dir = join(runDir(runId), project);
  }

  /** Screenshot a key state. `label` becomes part of the filename. */
  async shot(page: Page, label: string): Promise<void> {
    ensureDir(this.dir);
    const file = `${pad(++this.n)}-${slug(label)}.png`;
    await page.screenshot({ path: join(this.dir, file), fullPage: false });
    this.shots.push(join(this.project, file));
  }

  /** Record a named assertion for the per-journey report (does not throw). */
  check(name: string, ok: boolean, detail?: string): void {
    this.checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  }

  /** Persist this test's result. Called from the fixture teardown with the final status. */
  flush(status: string): void {
    const resultsDir = join(runDir(this.runId), "results");
    ensureDir(resultsDir);
    const result: JourneyResult = {
      project: this.project,
      surface: this.surface,
      title: this.title,
      status,
      shots: this.shots,
      checks: this.checks,
    };
    writeFileSync(join(resultsDir, `${this.project}__${slug(this.title)}.json`), JSON.stringify(result, null, 2), "utf8");
  }
}

/** Compile every results/*.json of a run into report.md + report.json. */
export function compileReport(runId: string): { total: number; passed: number } {
  const resultsDir = join(runDir(runId), "results");
  let files: string[] = [];
  try {
    files = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const results: JourneyResult[] = files.map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")) as JourneyResult);
  results.sort((a, b) => a.project.localeCompare(b.project) || a.title.localeCompare(b.title));

  const passed = results.filter((r) => r.status === "passed").length;
  const lines: string[] = [];
  lines.push(`# Cert E2E · Reporte de la corrida \`${runId}\``, "");
  lines.push(`**${passed}/${results.length}** journeys en verde.`, "");
  lines.push("| Proyecto | Surface | Journey | Estado | Checks | Screenshots |");
  lines.push("|---|---|---|---|---:|---:|");
  for (const r of results) {
    const okChecks = r.checks.filter((c) => c.ok).length;
    lines.push(
      `| ${r.project} | ${r.surface} | ${r.title} | ${r.status === "passed" ? "✅" : "❌ " + r.status} | ${okChecks}/${r.checks.length} | ${r.shots.length} |`,
    );
  }
  for (const r of results) {
    lines.push("", `## ${r.project} · ${r.title}`, "");
    for (const c of r.checks) lines.push(`- ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (r.shots.length) {
      lines.push("", "Evidencia:");
      for (const s of r.shots) lines.push(`- \`${s}\``);
    }
  }
  const out = runDir(runId);
  ensureDir(out);
  writeFileSync(join(out, "report.md"), lines.join("\n") + "\n", "utf8");
  writeFileSync(join(out, "report.json"), JSON.stringify({ runId, passed, total: results.length, results }, null, 2), "utf8");
  return { total: results.length, passed };
}
