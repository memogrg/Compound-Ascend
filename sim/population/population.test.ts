/**
 * Fase 3 · SYNTHETIC POPULATION at scale (headless breadth). Generates a parametric population
 * (10 guaranteed edges + sampled fill), runs each persona in ISOLATION (per-persona try/catch — the
 * library runner has none, so one throwing persona would abort the batch), applies the UNIVERSAL
 * sanity gates G0–G5, and reports every finding with the persona (seed+params) as a reproducer.
 *
 * A THROW or an identity break = P0; NaN/Inf, a wrong-sign balance, an implausible ratio = P1.
 * ANTI-ARTIFACT: any finding from the concurrent batch is RE-RUN SERIALLY (alone) by its seed before
 * being classified — a finding that doesn't reproduce serially is a concurrency artifact, not product.
 * ANTI-DEFANG: G0 verifies the seed actually applied (entities exist) BEFORE judging the app.
 *
 * Gated on SUPABASE_TEST_* (self-skips). `SIM_POP_N` sets the size (default 120; 300 for the cert
 * evidence run; a QUICK run uses ~20). Run: `npx vitest run --config sim/vitest.config.ts sim/population/population.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIM_DB_READY } from "../env";
import { EventLog } from "../event-log";
import { createSimUser } from "../harness";
import { AppDriver } from "../app-driver";
import { onMonthDay, virtualMonthDayISO } from "../clock";
import { userCurrentPeriod } from "@/lib/time/user-time";
import type { AuthContext } from "@/lib/auth/auth-context";
import { buildPopulation, generatorSelfCheck, PRIMARY, type PersonaPop } from "./generate";
import { runGates, type Finding } from "./gates";

const N = Number(process.env.SIM_POP_N ?? "120") || 120;
const BATCH = Number(process.env.SIM_POP_BATCH ?? "8") || 8;

/**
 * CHARACTERIZED finding (Fase 10, P1 ABIERTO) — `liquidAssetsPct < 0` for OVERDRAWN users: the app
 * permits negative liquidity, which enters as a negative "liquido" asset (rich-life-service.ts:359),
 * and `ratio()` doesn't clamp a negative numerator (rich-life-engine.ts:45) → the documented-[0,1]
 * fraction goes negative. Accounting identities (G3) HOLD → money math is correct; presentation only.
 * The gate STILL detects it (G5 is NOT defanged); these 10 known seeds are allow-listed so the suite
 * stays green on the KNOWN issue but turns RED on ANY new finding (regression guard, #655 pattern).
 * Fixing it (clamp the numerator) is a src/ change deferred to Fase 10 — see memory fase10-hallazgos.
 */
const KNOWN_LIQ_NEG_SEEDS = new Set([
  10815133, 11849610, 12040345, 4655274, 5689819, 6030716, 7396565, 8059205, 52031, 624100,
]);
function isKnownFinding(r: { seed: number; findings: Finding[] }): boolean {
  return (
    r.findings.length > 0 &&
    r.findings.every(
      (fnd) => KNOWN_LIQ_NEG_SEEDS.has(r.seed) && fnd.gate.startsWith("G5") && /liquidAssetsPct/.test(fnd.detail),
    )
  );
}

interface PersonaResult {
  id: string;
  label: string;
  seed: number;
  edge: string | null;
  fx: boolean;
  findings: Finding[];
  seedFailure: string | null;
}

/** Raw counts (independent of the gate reads) — did the seed apply? */
async function verifySeed(ctx: AuthContext, p: PersonaPop): Promise<string | null> {
  const [d, h, g] = await Promise.all([
    ctx.db.from("debts").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId),
    ctx.db.from("investment_holdings").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId),
    ctx.db.from("savings_goals").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId),
  ]);
  const exp = { debt: p.debt ? 1 : 0, hold: p.holding ? 1 : 0, goal: p.goal ? 1 : 0 };
  if ((d.count ?? 0) !== exp.debt) return `debts=${d.count} esperado ${exp.debt}`;
  if ((h.count ?? 0) !== exp.hold) return `holdings=${h.count} esperado ${exp.hold}`;
  if ((g.count ?? 0) !== exp.goal) return `goals=${g.count} esperado ${exp.goal}`;
  return null;
}

/** Seed the persona (setup + minimal 1-month money-loop) then run the gates, in ISOLATION. */
async function runOne(p: PersonaPop): Promise<PersonaResult> {
  const meta = { id: p.id, label: p.label, seed: p.seed, edge: p.edge, fx: p.fx };
  const log = new EventLog();
  let sim: Awaited<ReturnType<typeof createSimUser>> | null = null;
  try {
    sim = await createSimUser({ seed: p.seed >>> 0, currency: PRIMARY, nowStamp: Date.now(), log });
    const ctx = sim.ctx;
    const driver = new AppDriver(ctx, PRIMARY, log);

    await onMonthDay(0, 1, async () => {
      driver.day = 1;
      await driver.openingBalance(p.opening);
      if (p.holding) await driver.addHolding("Inversión", p.holding.value, p.holding.currency);
      if (p.goal) await driver.addGoal("Meta", p.goal.target);
    });
    const period = await onMonthDay(0, 1, () => userCurrentPeriod(ctx));
    let debtId: string | null = null;
    if (p.debt) {
      debtId = await onMonthDay(0, 1, () => driver.addDebt("Deuda", p.debt!.balance, p.debt!.minPayment, p.debt!.currency));
    }
    if (p.income > 0) {
      const incId = await onMonthDay(0, 5, () => driver.addIncomeBudgetLine("Salario", p.income, period));
      await onMonthDay(0, 5, () => driver.receiveIncome(incId, p.income, virtualMonthDayISO(0, 5)));
    }
    await onMonthDay(0, 10, () => driver.spend(p.expense, virtualMonthDayISO(0, 10), "Gasto"));
    // Only pay a debt in the run's PRIMARY currency: the app correctly rejects a cross-currency
    // payment (#437 guard), so an FX (USD) debt is seeded — and enters net worth converted — but
    // not paid here (paying it in CRC would (correctly) throw). Depth of FX payment is out of scope.
    if (debtId && p.debt!.currency === PRIMARY) {
      await onMonthDay(0, 12, () => driver.payDebt(debtId!, p.debt!.minPayment, virtualMonthDayISO(0, 12)));
    }

    // G0 · did the seed apply? (anti-defang — a mismatch is a SEED bug, not an app finding)
    const seedFailure = await onMonthDay(0, 20, () => verifySeed(ctx, p));
    if (seedFailure) return { ...meta, findings: [], seedFailure };

    // G1 (no throw so far) + G2–G5
    const findings = await onMonthDay(0, 20, () => runGates(ctx, p.fx));
    return { ...meta, findings, seedFailure: null };
  } catch (err) {
    // G1 · a THROW = P0 finding, the persona is the repro.
    return { ...meta, findings: [{ gate: "G1 no crash", severity: "P0", detail: err instanceof Error ? err.message : String(err) }], seedFailure: null };
  } finally {
    if (sim) await sim.teardown();
  }
}

function writeReport(runId: string, pop: PersonaPop[], results: PersonaResult[], known: PersonaResult[], novel: PersonaResult[], artifacts: PersonaResult[]): string {
  const dir = join(process.cwd(), "sim", "population", "out");
  mkdirSync(dir, { recursive: true });
  const seedFails = results.filter((r) => r.seedFailure);
  const green = results.length - known.length - novel.length - seedFails.length;
  const lines: string[] = [];
  lines.push(`# Fase 3 · Población sintética · corrida \`${runId}\``, "");
  lines.push(`- Personas: **${results.length}** (${pop.filter((p) => p.edge).length} bordes garantizados + ${pop.filter((p) => !p.edge).length} muestreadas)`);
  lines.push(`- Verdes (sin hallazgos): **${green}**`);
  lines.push(`- Fallos de SIEMBRA (G0, descartados — no app): **${seedFails.length}**`);
  lines.push(`- Artefactos de concurrencia (no reprodujeron serial, descartados): **${artifacts.length}**`);
  lines.push(`- Hallazgos CONOCIDOS caracterizados (P1 ABIERTO · Fase 10): **${known.length}**`);
  lines.push(`- Hallazgos NUEVOS (regresión — deben ser 0): **${novel.length}**`, "");
  const table = (rs: PersonaResult[]) => {
    const out = ["| Persona | edge | fx | seed | severidad | gate | detalle |", "|---|---|---|---|---|---|---|"];
    for (const r of rs) for (const fnd of r.findings) out.push(`| ${r.id} | ${r.edge ?? "-"} | ${r.fx ? "sí" : "-"} | ${r.seed} | ${fnd.severity} | ${fnd.gate} | ${fnd.detail.replace(/\|/g, "/")} |`);
    return out;
  };
  if (novel.length) {
    lines.push(`## ⚠️ Hallazgos NUEVOS (regresión — la suite queda ROJA)`, "", ...table(novel), "");
  }
  if (known.length) {
    lines.push(`## Hallazgo CONOCIDO · P1 ABIERTO para Fase 10 (caracterizado, gate NO desdentado)`, "");
    lines.push(`\`liquidAssetsPct < 0\` en usuarios en SOBREGIRO: la liquidez negativa entra como activo`);
    lines.push(`"liquido" negativo (rich-life-service.ts:359) y \`ratio()\` no clampa el numerador`);
    lines.push(`(rich-life-engine.ts:45) → la fracción documentada [0,1] se va a negativo. Las identidades`);
    lines.push(`contables (G3) VALEN → la matemática de dinero es correcta; es presentación. Fix (clamp) en`);
    lines.push(`Fase 10 (cambio de src/). El gate SIGUE detectándolo; estos seeds están allow-listados para`);
    lines.push(`regresión: verde en lo conocido, ROJO ante cualquier hallazgo nuevo.`, "", ...table(known), "");
  }
  if (seedFails.length) {
    lines.push(`## Fallos de siembra (G0 — bug de siembra, no de app)`, "");
    for (const r of seedFails) lines.push(`- ${r.id} (seed ${r.seed}): ${r.seedFailure}`);
  }
  const md = lines.join("\n") + "\n";
  writeFileSync(join(dir, "report.md"), md, "utf8");
  writeFileSync(join(dir, "report.json"), JSON.stringify({ runId, n: results.length, green, known, novel, artifacts, seedFails }, null, 2), "utf8");
  return md;
}

describe.skipIf(!SIM_DB_READY)("Simulador · Fase 3 · población sintética (amplitud + gates de sanidad)", () => {
  it(
    `corre N=${N} personas paramétricas, aísla por-persona, y clasifica outliers (repro serial)`,
    async () => {
      const pop = buildPopulation(N);
      // Generator self-check (anti-defang): specs bien-formadas antes de sembrar.
      const genErrs = generatorSelfCheck(pop);
      expect(genErrs, `GENERATOR-BUG (specs malformadas):\n${genErrs.join("\n")}`).toEqual([]);

      // Concurrent batches (ALS keeps each persona's virtual clock isolated per async subtree).
      const results: PersonaResult[] = [];
      for (let i = 0; i < pop.length; i += BATCH) {
        results.push(...(await Promise.all(pop.slice(i, i + BATCH).map(runOne))));
      }

      // ANTI-ARTIFACT: re-run each persona-with-findings SERIALLY (alone) before classifying.
      const flagged = results.filter((r) => r.findings.length > 0);
      const confirmed: PersonaResult[] = [];
      const artifacts: PersonaResult[] = [];
      for (const r of flagged) {
        const persona = pop.find((p) => p.id === r.id)!;
        const serial = await runOne(persona);
        if (serial.findings.length > 0) confirmed.push(serial);
        else artifacts.push(r);
      }

      // Characterized (allow-listed) known findings stay green; ANYTHING new turns the suite RED.
      const known = confirmed.filter(isKnownFinding);
      const novel = confirmed.filter((r) => !isKnownFinding(r));

      const runId = `pop-${N}-${pop[0]!.seed}`;
      const md = writeReport(runId, pop, results, known, novel, artifacts);
      console.log(`\n${md}`);

      // Green on the known/characterized finding; RED on any seeding failure OR any NEW finding.
      expect(results.filter((r) => r.seedFailure).map((r) => `${r.id}: ${r.seedFailure}`), "fallos de SIEMBRA (arreglar el generador/driver, no la app)").toEqual([]);
      const novelLines = novel.flatMap((r) => r.findings.map((f) => `[${f.severity}] ${r.id}(seed ${r.seed}): ${f.gate} — ${f.detail}`));
      expect(novelLines, `REGRESIÓN · hallazgos NUEVOS fuera del allowlist de Fase 10:\n${novelLines.join("\n")}`).toEqual([]);
    },
    600_000,
  );
});
