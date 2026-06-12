import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getIndexRates } from "@/modules/control/services/index-rates";
import { DebtsView } from "@/modules/control/components/debts-view";
import type { DebtsOverview } from "@/modules/control/services/debts-service";

/**
 * Préstamos y deudas — calculadora completa con amortización, comparación de
 * estrategias y proyección de pago. Tab propio en la navegación.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const overview: DebtsOverview = configured
    ? await getDebtsOverview(await getIndexRates())
    : { currency: "CRC", incomeMonthly: 0, freeCashflow: 0, indexRates: {}, debts: [] };

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
