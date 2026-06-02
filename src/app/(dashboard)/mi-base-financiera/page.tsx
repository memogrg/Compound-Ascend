import { isSupabaseConfigured } from "@/lib/auth/session";
import { getBaseSummary, getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import { BaseDashboard } from "@/modules/financial-base/components/base-dashboard";
import { BaseActions } from "@/modules/financial-base/components/base-actions";
import { EmptyState } from "@/components/shared/states";
import type { BaseSummary } from "@/modules/financial-base/services/base-service";

/**
 * Módulo 2 — Mi Base Financiera. Radiografía mensualizada de ingresos y gastos.
 */
export default async function Page() {
  const configured = isSupabaseConfigured();

  let summary: BaseSummary;
  let currency = "CRC";
  if (configured) {
    [summary, currency] = await Promise.all([getBaseSummary(), getPrimaryCurrency()]);
  } else {
    summary = { indicators: computeBaseIndicators([], []), incomes: [], expenses: [] };
  }

  const isEmpty = summary.incomes.length === 0 && summary.expenses.length === 0;

  return (
    <div className="grid">
      <div
        className="card card-pad"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <div className="card-title">Tu mapa financiero</div>
          <div className="card-sub">
            Vamos a construir tu radiografía mensual. No tiene que estar perfecto.
          </div>
        </div>
        <BaseActions currency={currency} />
      </div>

      {!configured ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración: conecta Supabase para guardar tus ingresos y gastos de forma segura.
        </div>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon="income"
          title="Empieza por tu ingreso principal"
          description="Agrega tu salario u otra fuente de ingreso y luego tus gastos esenciales. Con eso ya podemos darte un primer diagnóstico de tu flujo libre, tus tasas y tu presión financiera."
        />
      ) : (
        <BaseDashboard summary={summary} currency={currency} />
      )}
    </div>
  );
}
