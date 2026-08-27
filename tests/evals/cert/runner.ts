/**
 * Live audit runner: seed a persona, run 6 virtual months capturing the trajectory
 * series, build the REAL context at month1 and month6, spot-check the month6 trajectory
 * is non-empty (else it's a HARNESS artifact, not an advisor failure), then run the probe
 * suites through the REAL advisor (injected Gemini) + deterministic checks + graded judge.
 */
import type { AIProvider } from "@/lib/ai/provider";
import type { AuthContext } from "@/lib/auth/auth-context";
import { withSimAuth } from "@/lib/auth/sim-auth";
import { financeChatWithTools } from "@/lib/ai/orchestrator";
import { resolveActionProposal } from "@/lib/ai/action-resolver";
import { computeTrajectory, type MonthlyPoint, type PortfolioPoint } from "@/lib/ai/trajectory";
import { getMonthFlow } from "@/modules/financial-base/services/month-flow-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { generateNetWorthSnapshot } from "@/modules/rich-life/services/net-worth-snapshot-service";
import { generateMonthlySnapshot } from "@/modules/financial-base/services/snapshot-service";
import { generateAndSaveSnapshot } from "@/modules/wealth/services/snapshot-service";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { createSimUser } from "../../../sim/harness";
import { AppDriver } from "../../../sim/app-driver";
import { onMonthDay, virtualMonthDayISO } from "../../../sim/clock";
import { EventLog } from "../../../sim/event-log";
import { buildSimContext, type BuiltContext } from "./context-builder";
import { checkGrounding } from "./grounding";
import { detectContradictions } from "./contradictions";
import { judgeRubric, applyAccionabilidadPolicy } from "./rubric";
import {
  ADVERSARIAL,
  LONGITUDINAL,
  GENERICO,
  CONSISTENCIA,
  PROACTIVIDAD,
  CONFRONTACION,
  HIGHLIGHTS,
} from "./prompts";
import type { AuditPersona } from "./personas";
import type { AuditOutput, Finding, ProbeSuite } from "./types";

const CURRENCY = "CRC";
const MONTHS = 6;
const pad = (n: number): string => String(n).padStart(2, "0");

export interface AuditOpts {
  /** Real Gemini provider (model under test). */
  provider: AIProvider;
  /** Strong judge provider, or undefined (rubric skipped). */
  judge: AIProvider | undefined;
  /** Judge runs to average. */
  N: number;
  nowStamp: number;
}

function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ 0x0a1c0de) >>> 0;
}

interface EvalArgs {
  personaName: string;
  /** The persona's AuthContext — makes the advisor's DB tools (consultar_historial…)
   *  resolve to this persona headless via withSimAuth. */
  ctx: AuthContext;
  built: BuiltContext;
  suite: ProbeSuite;
  prompt: string;
  expectedRedFlags: string[];
  point?: "mes1" | "mes6";
  /** ¿El turno amerita cerrar con acción? Default true; false (adversarial/highlights) → accionabilidad NA. */
  expectsAction?: boolean;
}

async function evaluate(args: EvalArgs, opts: AuditOpts): Promise<AuditOutput> {
  // withSimAuth: the advisor's read tools (consultar_historial → net_worth_snapshots, …)
  // call cookie-based readers; under the ALS they resolve to THIS persona headless.
  const res = await withSimAuth(args.ctx, async () => {
    const r = await financeChatWithTools(
      [{ role: "user", content: args.prompt }],
      args.built.context,
      args.built.toolContext,
      opts.provider,
    );
    // Resolver la acción como en producción (chat/route.ts): el audit juzga la acción RESUELTA, no la
    // cruda. resolveActionProposal es ctx-aware (authCtx) → un abono a una deuda saldada se anula
    // headless, igual que en prod. `today` no afecta el tipo (solo el paymentDate de salida).
    const action = await resolveActionProposal(r.action, {
      currency: args.built.context.currency,
      today: "2026-01-01",
      authCtx: args.ctx,
    });
    return { ...r, action };
  });
  const reply = res.reply;
  const actionType = res.action?.type ?? null;
  const grounding = checkGrounding(reply, args.built.facts);
  const contradictions = detectContradictions(reply, actionType, args.built.facts);
  const rubric = await judgeRubric(
    opts.judge,
    {
      prompt: args.prompt,
      reply,
      contextDigest: args.built.digest,
      expectedRedFlags: args.expectedRedFlags,
    },
    opts.N,
  );
  // Accionabilidad DETERMINISTA por lo que el turno AMERITA (no la discreción del juez): NA para los
  // no-acción (adversarial/highlights), score bajo para un accionable que el juez NA-eó. Ver rubric.ts.
  if (rubric) applyAccionabilidadPolicy(rubric, args.expectsAction);
  return {
    persona: args.personaName,
    point: args.point ?? "mes6",
    suite: args.suite,
    prompt: args.prompt,
    reply,
    actionType,
    lane: res.lane,
    grounding,
    contradictions,
    rubric,
    expectedRedFlags: args.expectedRedFlags,
  };
}

export interface PersonaAudit {
  outputs: AuditOutput[];
  findings: Finding[];
  /** The month6 generic output, for cross-persona "generic" comparison. */
  genericMonth6?: AuditOutput;
}

export async function auditPersona(persona: AuditPersona, opts: AuditOpts): Promise<PersonaAudit> {
  const log = new EventLog();
  const sim = await createSimUser({
    seed: seedOf(persona.key),
    currency: CURRENCY,
    nowStamp: opts.nowStamp,
    log,
  });
  const { ctx } = sim;
  const outputs: AuditOutput[] = [];
  const findings: Finding[] = [];
  let genericMonth6: AuditOutput | undefined;

  try {
    const currency = await getPrimaryCurrency(ctx);
    const driver = new AppDriver(ctx, currency, log);

    const ids = await onMonthDay(0, 1, async () => {
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      return persona.setup(driver, period);
    });

    const monthly: MonthlyPoint[] = [];
    const portfolio: PortfolioPoint[] = [];
    let ctxMonth1: BuiltContext | null = null;
    // El turno longitudinal mes1 corre DENTRO del loop (en m=0, con 1 solo snapshot) para que
    // consultar_historial se comporte como en un mes1 REAL (conDatos=false). Si no, la BD ya tendría
    // los 6 snapshots al llegar al suite-loop y el gate se abriría (artefacto de fidelidad, Fase 10).
    let mes1LongDone = false;

    for (let m = 0; m < MONTHS; m++) {
      await onMonthDay(m, 20, async () => {
        driver.day = m * 100 + 20;
        await persona.monthEvents(driver, ids, m);
      });
      await onMonthDay(m, 28, async () => {
        driver.day = m * 100 + 28;
        const period = await userCurrentPeriod(ctx);
        await generateNetWorthSnapshot({ year: period.year, month: period.month }, ctx, {
          precios: "cache",
        });
        const [mf, rl, port] = await Promise.all([
          getMonthFlow(period, ctx),
          getRichLifeSummary({ precios: "cache" }, ctx),
          getPortfolioReport(ctx),
        ]);
        monthly.push({
          period: `${period.year}-${pad(period.month)}`,
          income: mf.real.operatingIncome,
          expense: mf.real.operatingExpense,
          freeCashflow: mf.real.operatingFlow,
        });
        portfolio.push({
          date: `${period.year}-${pad(period.month)}-01`,
          portfolioValue: port.analytics.totalPortfolioValue,
          netWorth: rl.snapshot.indicators.netWorth,
        });
        // Persist monthly_snapshots (gasto/ingreso/ahorro) + portfolio_snapshots so
        // consultar_historial has real series for ALL métricas (net worth escrito arriba).
        // generateMonthlySnapshot recibe ctx explícito → threadea a getRealTotals/getBudgetTotals
        // → getDisplayCurrency(ctx), sin tocar el cookies() crudo (headless-safe, determinista);
        // generateAndSaveSnapshot usa service-role + simNow() (fecha virtual) → headless-safe.
        await generateMonthlySnapshot(period, ctx);
        await generateAndSaveSnapshot(
          ctx.userId,
          port.analytics.totalPortfolioValue,
          port.analytics.totalCostBasis,
          rl.snapshot.indicators.netWorth,
          currency,
        );
        if (m === 0) {
          ctxMonth1 = await buildSimContext(
            ctx,
            computeTrajectory(monthly, portfolio),
            persona.dna,
            { monthly, portfolio },
          );
          // Con 1 snapshot en la BD (este es m=0), corré el turno longitudinal mes1 acá: así el guard
          // de tendencia ve conDatos=false y bloquea una trayectoria fabricada, como en producción.
          if (persona.suites.includes("longitudinal")) {
            outputs.push(
              await evaluate(
                {
                  personaName: persona.displayName,
                  ctx,
                  built: ctxMonth1,
                  suite: "longitudinal",
                  prompt: LONGITUDINAL.prompt,
                  expectedRedFlags: LONGITUDINAL.expectedRedFlags,
                  point: "mes1",
                },
                opts,
              ),
            );
            mes1LongDone = true;
          }
        }
      });
    }

    const ctxMonth6 = await onMonthDay(MONTHS - 1, 28, () =>
      buildSimContext(ctx, computeTrajectory(monthly, portfolio), persona.dna, {
        monthly,
        portfolio,
      }),
    );

    // SPOT-CHECK: month6 trajectory must be non-empty before scoring longitudinal.
    const trajOk = ctxMonth6.context.trajectory !== undefined;
    if (!trajOk) {
      findings.push({
        kind: "app-finding",
        persona: persona.displayName,
        detail:
          "Trajectory VACÍO a mes 6 → artefacto del harness (no se puntúa la suite longitudinal, no es fallo del asesor). Revisar la captura de puntos.",
      });
    }

    for (const suite of persona.suites) {
      if (suite === "adversarial") {
        for (const p of ADVERSARIAL) {
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: ctxMonth6,
                suite,
                prompt: p.prompt,
                expectedRedFlags: p.expectedRedFlags,
                expectsAction: p.expectsAction,
              },
              opts,
            ),
          );
        }
      } else if (suite === "proactividad") {
        // Turnos abiertos con una señal dura presente: mide si el asesor VOLUNTEA la alarma.
        for (const p of PROACTIVIDAD) {
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: ctxMonth6,
                suite,
                prompt: p.prompt,
                expectedRedFlags: p.expectedRedFlags,
                expectsAction: p.expectsAction,
              },
              opts,
            ),
          );
        }
      } else if (suite === "confrontacion" || suite === "highlights") {
        // Racionalización de mal hábito (confrontacion) / progreso real (highlights): probe-arrays
        // de mes6, como proactividad. Suben la muestra de confrontacion_calida y proactividad-positivo.
        const probes = suite === "confrontacion" ? CONFRONTACION : HIGHLIGHTS;
        for (const p of probes) {
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: ctxMonth6,
                suite,
                prompt: p.prompt,
                expectedRedFlags: p.expectedRedFlags,
                expectsAction: p.expectsAction,
              },
              opts,
            ),
          );
        }
      } else if (suite === "longitudinal") {
        if (ctxMonth1 && !mes1LongDone) {
          // Fallback: el turno mes1 normalmente ya corrió en m=0 (con 1 snapshot). Solo llega acá si
          // no se disparó allá; se deja por completitud, aunque acá la BD ya tenga los 6 snapshots.
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: ctxMonth1,
                suite,
                prompt: LONGITUDINAL.prompt,
                expectedRedFlags: LONGITUDINAL.expectedRedFlags,
                point: "mes1",
              },
              opts,
            ),
          );
        }
        if (trajOk) {
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: ctxMonth6,
                suite,
                prompt: LONGITUDINAL.prompt,
                expectedRedFlags: LONGITUDINAL.expectedRedFlags,
                point: "mes6",
              },
              opts,
            ),
          );
        }
      } else if (suite === "generico") {
        const out = await evaluate(
          {
            personaName: persona.displayName,
            ctx,
            built: ctxMonth6,
            suite,
            prompt: GENERICO.prompt,
            expectedRedFlags: GENERICO.expectedRedFlags,
          },
          opts,
        );
        outputs.push(out);
        genericMonth6 = out;
      } else if (suite === "consistencia" && ids.debtId) {
        // Before: the debt is large → advice should prioritize it.
        outputs.push(
          await evaluate(
            {
              personaName: persona.displayName,
              ctx,
              built: ctxMonth6,
              suite,
              prompt: CONSISTENCIA.prompt,
              expectedRedFlags: CONSISTENCIA.expectedRedFlags,
            },
            opts,
          ),
        );
        // Mutate: pay the debt to ZERO, rebuild context, re-ask. If the advisor still
        // recommends paying that (now-saldada) debt → detectPayPaidDebt fires a hard ❌.
        const outstanding = ctxMonth6.facts.debts.reduce((s, d) => s + d.balance, 0);
        if (outstanding > 0) {
          await onMonthDay(MONTHS - 1, 28, async () => {
            driver.day = (MONTHS - 1) * 100 + 28;
            await driver.payDebt(ids.debtId!, outstanding, virtualMonthDayISO(MONTHS - 1, 27));
          });
          const after = await onMonthDay(MONTHS - 1, 28, () =>
            buildSimContext(ctx, computeTrajectory(monthly, portfolio), persona.dna, {
              monthly,
              portfolio,
            }),
          );
          outputs.push(
            await evaluate(
              {
                personaName: persona.displayName,
                ctx,
                built: after,
                suite,
                prompt: CONSISTENCIA.prompt,
                expectedRedFlags: CONSISTENCIA.expectedRedFlags,
              },
              opts,
            ),
          );
        }
      }
    }

    return { outputs, findings, genericMonth6 };
  } finally {
    await sim.teardown();
  }
}
