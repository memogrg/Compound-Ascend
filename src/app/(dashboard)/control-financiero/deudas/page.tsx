import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { DebtsView } from "@/modules/control/components/debts-view";
import { Icon } from "@/components/ui/icon";
import type { DebtsOverview } from "@/modules/control/services/debts-service";

/**
 * Sub-página de Control — Préstamos y deudas. Calculadora completa con
 * amortización, comparación de estrategias y proyección de pago.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();
  const overview: DebtsOverview = configured
    ? await getDebtsOverview()
    : { currency: "CRC", incomeMonthly: 0, debts: [] };

  return (
    <div className="grid">
      <div
        className="card card-pad"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <div className="card-title">Préstamos y deudas</div>
          <div className="card-sub">
            Tu plan para salir de deudas: estrategia, amortización y cuánto te ahorras pagando de más.
          </div>
        </div>
        <Link className="btn btn-secondary" href="/control-financiero">
          <Icon name="dashboard" width={2} /> Control
        </Link>
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
