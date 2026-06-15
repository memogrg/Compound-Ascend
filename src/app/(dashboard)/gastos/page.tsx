import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import { IncomeExpenseSection } from "@/modules/financial-base/components/v2/sections";

/** Fecha de corte de los frascos: ?asOf=YYYY-MM-DD válido, o el día de hoy. */
function resolveAsOf(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Gastos — ruta propia. Lee del mismo modelo V2 (budget_items + transactions). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const sp = await searchParams;
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para gestionar tus gastos.
      </div>
    );
  }

  // Filtro propio de "Categorías de gasto": los frascos reflejan el mes del día
  // elegido, con el gasto real cortado a ese día. No re-scopea cards ni gráficas.
  const asOf = resolveAsOf(sp.asOf);
  const [ay, am] = asOf.split("-").map(Number) as [number, number];
  const jarsPeriod = monthPeriod(ay, am);
  const jars = await getExpenseJarsAsOf({
    tree: view.tree,
    period: jarsPeriod,
    asOf,
    currency: view.currency,
  });

  return (
    <div className="grid">
      <IncomeExpenseSection
        view={{ ...view, jars }}
        kind="expense"
        jarsAsOf={asOf}
        jarsPeriod={jarsPeriod}
      />
    </div>
  );
}
