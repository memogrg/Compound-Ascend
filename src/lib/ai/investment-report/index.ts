import "server-only";

/**
 * INFORME DE PORTAFOLIO (Etapa A del carril "deep") — orquestación: lectura → paquete de evidencia
 * (puro) → render por plantilla (puro) → persistencia BEST-EFFORT.
 *
 * Cero tokens de LLM y cero llamadas de red nuevas: se apoya en el mismo contexto perezoso que usa
 * el chat (portfolio + patrimonio + defensa) y en las deudas/números ya normalizados a la moneda de
 * VISUALIZACIÓN. Si el insert falla, se loguea y el informe se devuelve igual — persistir es un
 * efecto secundario, nunca el camino crítico de la respuesta.
 */
import { buildFinancialContext } from "@/lib/ai/context-engine";
import { normalizeDebtsForTool, type ToolContext } from "@/lib/ai/orchestrator";
import { buildEvidencePack, type EvidencePack } from "@/lib/ai/investment-report/evidence";
import { renderEvidenceReport } from "@/lib/ai/investment-report/render";
import { listDebts } from "@/modules/control";
import { getDisplayCurrency } from "@/modules/financial-base";
import { getPatrimonioReport } from "@/modules/wealth/services/patrimonio-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { logger } from "@/lib/logger";

export { buildEvidencePack, renderEvidenceReport };
export type { EvidencePack };

export type InvestmentReport = {
  evidence: EvidencePack;
  reportMd: string;
  currency: string;
  createdAt: string;
};

/**
 * Arma el ToolContext MÍNIMO que consume el paquete de evidencia: moneda de visualización, deudas
 * normalizadas (para la comparación contra el rendimiento supuesto) y los números patrimoniales
 * (invertible + Independencia). Las metas no las usa el informe, así que no se leen.
 * Best-effort por parte: lo que falle queda ausente y su sección se declara no disponible.
 */
async function buildReportToolContext(): Promise<ToolContext> {
  const display = await getDisplayCurrency().catch(() => "CRC");
  let rates: Record<string, number> | null = null;
  try {
    rates = await getFxRates();
  } catch {
    rates = null;
  }
  const tc: ToolContext = { currency: display, fxUnavailable: !rates, debts: [] };
  try {
    tc.debts = normalizeDebtsForTool(await listDebts(), display, rates);
  } catch {
    tc.debts = [];
  }
  try {
    const pat = await getPatrimonioReport();
    const toDisplay = (v: number): number =>
      pat.currency === display ? v : rates ? convertCurrency(v, pat.currency, display, rates) : NaN;
    const independencia = toDisplay(pat.report.numeroDeIndependencia);
    const invertible = toDisplay(pat.report.investableWealth);
    if (Number.isFinite(independencia)) tc.independenceNumber = independencia;
    if (Number.isFinite(invertible)) tc.investableWealth = invertible;
  } catch {
    // números ausentes → la sección de brecha lo dice, no se estima
  }
  return tc;
}

/**
 * Genera el informe determinista del usuario en sesión y lo persiste (best-effort).
 * `persist: false` lo calcula sin guardarlo (útil para previsualizar).
 */
export async function generateInvestmentReport(
  opts: { persist?: boolean } = {},
): Promise<InvestmentReport> {
  const [ctx, tc] = await Promise.all([
    // Mismo alcance perezoso que declara scopeForIntent("informe_inversion"): sin `flavor` (solo LLM).
    buildFinancialContext({ portfolio: true, patrimonio: true, defense: true }),
    buildReportToolContext(),
  ]);
  const evidence = buildEvidencePack(ctx, tc);
  const reportMd = renderEvidenceReport(evidence, evidence.currency);
  const report: InvestmentReport = {
    evidence,
    reportMd,
    currency: evidence.currency,
    createdAt: new Date().toISOString(),
  };
  if (opts.persist !== false) await persistInvestmentReport(report);
  return report;
}

/** Guarda el informe. BEST-EFFORT: cualquier fallo se loguea y no rompe la respuesta. */
export async function persistInvestmentReport(
  report: InvestmentReport,
  ctx?: AuthContext,
): Promise<void> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    const { error } = await db.from("investment_reports").insert({
      user_id: userId,
      evidence: report.evidence,
      report_md: report.reportMd,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("persistInvestmentReport falló", {
      message: err instanceof Error ? err.message : "?",
    });
  }
}

/** Último informe guardado del usuario. null si no hay ninguno (o si la lectura falla). */
export async function getLatestInvestmentReport(
  ctx?: AuthContext,
): Promise<InvestmentReport | null> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    let query = db.from("investment_reports").select("evidence, report_md, created_at");
    if (ctx) query = query.eq("user_id", userId); // service-role → filtro explícito
    const { data } = await query.order("created_at", { ascending: false }).limit(1);
    const row = data?.[0];
    if (!row) return null;
    const evidence = row.evidence as EvidencePack;
    return {
      evidence,
      reportMd: row.report_md,
      currency: evidence?.currency ?? "CRC",
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.warn("getLatestInvestmentReport falló", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}
