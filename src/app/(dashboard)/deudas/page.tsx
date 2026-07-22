import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getIndexRates } from "@/modules/control/services/index-rates";
import { DebtsView } from "@/modules/control/components/debts-view";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { buildDebtAdvice, type DebtAdvice } from "@/modules/control/engine/debt-advice";
import { AdvisorNote } from "@/components/shared/advisor-note";
import type { DebtsOverview } from "@/modules/control/services/debts-service";

/**
 * Préstamos y deudas — calculadora completa con amortización, comparación de
 * estrategias y proyección de pago. Tab propio en la navegación.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const overview: DebtsOverview = configured
    ? await getDebtsOverview(await getIndexRates())
    : { currency: "CRC", incomeMonthly: 0, freeCashflow: 0, indexRates: {}, debts: [], raw: [] };

  // Nota del asesor (Fase 5a): recomendación sobre deudas en su tono. Best-effort.
  let advice: DebtAdvice | null = null;
  if (configured) {
    try {
      const draft = await getDraft();
      if (Object.keys(draft).length > 0) {
        const diag = buildDiagnosis(draft);
        advice = buildDebtAdvice({
          archetypeLabel: diag.archetypeLabel,
          tone: diag.reading?.companionship.tone,
          dominantValue: draft.dineroPrimero?.[0]?.replace(/_/g, " "),
          debts: overview.raw.map((d) => ({
            name: d.name,
            balance: d.balance,
            apr: d.apr,
            delinquency: d.delinquency,
          })),
        });
      }
    } catch {
      // Sin perfil/diagnóstico: la página sigue sin la nota.
    }
  }

  return (
    <div className="grid">
      <div
        className="card card-pad"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="card-title">Préstamos y deudas</div>
          <div className="card-sub">
            Tu plan para salir de deudas: estrategia, amortización y cuánto te ahorras pagando de
            más.
          </div>
        </div>
      </div>

      {advice ? <AdvisorNote {...advice} /> : null}

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración. Conecta Supabase para gestionar tus deudas reales.
        </div>
      ) : (
        <DebtsView overview={overview} />
      )}
    </div>
  );
}
