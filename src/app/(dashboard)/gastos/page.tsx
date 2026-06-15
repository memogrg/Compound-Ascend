import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { IncomeExpenseSection } from "@/modules/financial-base/components/v2/sections";

/** Gastos — ruta propia. Lee del mismo modelo V2 (budget_items + transactions). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const view = await loadBaseView(sp.period);

  if (!view) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para gestionar tus gastos.
      </div>
    );
  }

  return (
    <div className="grid">
      <IncomeExpenseSection view={view} kind="expense" />
    </div>
  );
}
