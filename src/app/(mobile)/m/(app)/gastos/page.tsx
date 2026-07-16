import { MobileHeader } from "../../components/mobile-header";
import { MEmptyState } from "../../components/content-kit";
import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import { monthPeriod } from "@/modules/financial-base";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import { GastosManager } from "./gastos-manager";

/** Total gastado/presupuestado de un frasco (para el % del header; el manager repite este cálculo del lado cliente). */
function jarTotals(jar: Jar): { spent: number; budget: number } {
  if (jar.kind === "normal") {
    return jar.envelopes.reduce(
      (acc, e) => ({ spent: acc.spent + e.spent, budget: acc.budget + e.budget }),
      { spent: 0, budget: 0 },
    );
  }
  if (jar.totals) return { spent: jar.totals.spent, budget: jar.totals.budget };
  return jar.items.reduce(
    (acc, it) => ({ spent: acc.spent + (it.spent ?? 0), budget: acc.budget + (it.budget ?? 0) }),
    { spent: 0, budget: 0 },
  );
}

/**
 * /m/gastos — paridad con la web /gastos (sistema V2). Frascos (grupos) con sobres
 * (categorías hoja): presupuesto (budget_items) vs gasto real (transactions). Reutiliza
 * EXACTAMENTE la orquestación de la web (loadBaseView + getExpenseJarsAsOf) y las mismas
 * Server Actions V2 (vía GastosManager: addTransactionAction + addCategoryAction/
 * addBudgetItemAction + setEnvelopeBudgetAction). Lo capturado aquí aparece en la web
 * (mismas transactions/expense_categories). es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileGastos() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <MobileHeader variant="inner" eyebrow="Base" title="Gastos" backHref="/m" backLabel="Volver a Inicio" />
          <MEmptyState
            icon="template"
            title="Empieza por tu base"
            description="Cuando captures tus ingresos y tu presupuesto, aquí verás en qué se va el mes y cuánto te queda en cada frasco."
            actionLabel="Capturar mi base financiera"
            actionHref="/m/mi-base-financiera"
          />
        </div>
      </div>
    );
  }

  const now = new Date();
  const period = monthPeriod(now.getFullYear(), now.getMonth() + 1);
  const asOf = now.toISOString().slice(0, 10);
  const currency = view.currency;
  const jars = await getExpenseJarsAsOf({ tree: view.tree, period, asOf, currency });

  const totals = jars.reduce(
    (acc, j) => {
      const t = jarTotals(j);
      return { spent: acc.spent + t.spent, budget: acc.budget + t.budget };
    },
    { spent: 0, budget: 0 },
  );
  const headerPct = totals.budget > 0 ? Math.round((totals.spent / totals.budget) * 100) : null;

  // Metadatos por categoría (sistema vs. usuario, favorito, icono/color/nombre) para
  // decidir qué es editable/borrable/personalizable, como la web.
  const categoryMeta: Record<
    string,
    { isSystem: boolean; isFavorite: boolean; icon: string | null; color: string | null; name: string }
  > = {};
  for (const c of view.categories) {
    categoryMeta[c.id] = {
      isSystem: c.isSystem,
      isFavorite: c.isFavorite,
      icon: c.icon,
      color: c.color,
      name: c.name,
    };
  }

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Base"
          title="Gastos"
          backHref="/m"
          backLabel="Volver a Inicio"
          badge={headerPct != null ? <span className="badge neutral">{headerPct}%</span> : undefined}
        />
        <GastosManager
          jars={jars}
          currency={currency}
          accounts={view.accounts}
          period={period}
          categoryMeta={categoryMeta}
          canPersonalize={view.canPersonalize}
          personalization={view.personalization}
        />
      </div>
    </div>
  );
}

