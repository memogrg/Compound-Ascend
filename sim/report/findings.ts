/**
 * Curated findings for the report. The three historical bugs the simulator caught
 * (and we fixed) + the one known discrepancy it characterizes (#655). The overall
 * "clean run" line is computed dynamically from the results.
 */
import type { Finding, RunResult } from "./types";

export const HISTORICAL_FINDINGS: Finding[] = [
  {
    kind: "bug-fixed",
    title: "Saldo de deuda vigente canónico (Patrimonio vs Deudas)",
    detail:
      "aggregateNetWorth leía debts.balance CRUDO (el ancla de alta) mientras Deudas derivaba el vigente con recomputeFromPayments; pagar una deuda bajaba el patrimonio neto. Fix: función canónica currentDebtBalance/getCurrentDebtBalances usada por Patrimonio, Deudas y las fichas.",
    ref: "PR #650/#651",
  },
  {
    kind: "bug-fixed",
    title: "Chip vs-mes de Patrimonio con patrimonio neto negativo",
    detail:
      "buildPatrimonioVsMes devolvía el chip entero null con neto previo ≤ 0, así que los usuarios sobreendeudados / de ingreso muy bajo no veían su tendencia. Fix: flecha + color del signo de wealthVelocity siempre; magnitud con |base|; degrada a monto si base≈0.",
    ref: "PR #654",
  },
  {
    kind: "bug-fixed",
    title: "Costura F1a a medias: getPortfolioReport → fetchCachedPrices sin ctx",
    detail:
      "getPortfolioReport no threadeaba ctx a fetchCachedPrices → headless reventaba (requireUser → cookies fuera de request). En prod funcionaba (había request scope). Fix: threadear ctx.",
    ref: "PR #656",
  },
  {
    kind: "discrepancy",
    title: "El auto-DCA no escribe investment_transactions (aportes recurrentes invisibles)",
    detail:
      "ensureMonthlyContributions escribe holding_contributions pero NO investment_transactions; solo las compras manuales lo hacen. Los aportes recurrentes quedan invisibles en el historial de compras (UI móvil/web + IA consultar_detalle). Caracterizado por el validador DCA #6 (assert del comportamiento actual).",
    ref: "#655",
  },
];

/** Overall status line from the run results (0 fallas → limpio). */
export function statusFinding(runs: RunResult[]): Finding {
  const totalChecks = runs.reduce((s, r) => s + r.log.checks.length, 0);
  const totalFail = runs.reduce((s, r) => s + r.log.failures.length, 0);
  return totalFail === 0
    ? {
        kind: "clean",
        title: `Corrida limpia — ${totalChecks} checks, 0 fallas en ${runs.length} personas`,
        detail:
          "Todos los invariantes núcleo + evolución + DCA se sostienen a lo largo de la ventana multi-mes.",
      }
    : {
        kind: "discrepancy",
        title: `${totalFail} check(s) en rojo sobre ${totalChecks}`,
        detail: "Revisá el detalle por persona más abajo.",
      };
}
