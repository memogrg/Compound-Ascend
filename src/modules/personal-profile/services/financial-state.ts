import "server-only";

/**
 * Arma el estado financiero real del usuario para el motor de próxima jugada.
 * Cada fuente va en su try/catch best-effort: si una falla, su flag cae a false
 * y la próxima jugada sigue calculándose con lo que sí cargó.
 */
import type { ProfileDraft } from "@/modules/personal-profile/types";
import type { FinancialState } from "@/modules/personal-profile/engine/next-move";

export async function getFinancialState(draft: ProfileDraft): Promise<FinancialState> {
  const state: FinancialState = {
    hasBase: false,
    hasEmergencyFund: draft.hasEmergencyFund === "si" || draft.hasEmergencyFund === "construyendo",
    hasGoals: false,
    hasDebts: false,
    hasUrgentDebt: false,
    hasInvestments: false,
    dominantValue: draft.dineroPrimero?.[0]?.replace(/_/g, " "),
  };

  try {
    const { getBaseSummary } = await import("@/modules/financial-base");
    const base = await getBaseSummary();
    state.hasBase =
      base.indicators.incomeMonthly > 0 || base.indicators.expenseMonthly > 0;
  } catch {
    // Sin base: hasBase queda false.
  }

  try {
    const { listGoals, listDebts } = await import(
      "@/modules/control/services/control-service"
    );
    const [goals, debts] = await Promise.all([listGoals(), listDebts()]);
    state.hasGoals = goals.length > 0;
    state.hasDebts = debts.some((d) => d.balance > 0);
    state.hasUrgentDebt = debts.some((d) => !!d.delinquency && d.delinquency !== "no");
  } catch {
    // Sin metas/deudas: flags quedan false.
  }

  try {
    const { listHoldings } = await import("@/modules/wealth/services/holdings-service");
    state.hasInvestments = (await listHoldings()).length > 0;
  } catch {
    // Sin inversiones: hasInvestments queda false.
  }

  return state;
}
