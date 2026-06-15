import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { BaseHeader } from "@/modules/financial-base/components/v2/base-header";
import { IncomeExpenseSection } from "@/modules/financial-base/components/v2/sections";

/** Ingresos — ruta propia. Lee del mismo modelo V2 (budget_items + transactions). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; range?: string }>;
}) {
  const sp = await searchParams;
  // El tab de Ingresos siempre pasa un rango (default "1m"); las demás rutas
  // omiten el rango y conservan la ventana mensual/6-meses por defecto.
  const view = await loadBaseView(sp.period, sp.range ?? "1m");

  if (!view) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para gestionar tus ingresos.
      </div>
    );
  }

  return (
    <div className="grid">
      <BaseHeader
        title="Ingresos"
        sub="Planificado vs real y registro del mes."
        period={view.period}
      />
      <IncomeExpenseSection view={view} kind="income" />
    </div>
  );
}
