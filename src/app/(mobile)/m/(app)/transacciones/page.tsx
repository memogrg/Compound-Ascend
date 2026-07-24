import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import {
  listMyPendingProposals,
  type PendingProposalView,
} from "@/modules/financial-base/services/ingest-proposals-view";
import {
  selectUncategorized,
  selectableCategoryLeaves,
} from "@/modules/financial-base/engine/classify";
import {
  findUnlinkedCandidates,
  buildEntityAlerts,
} from "@/modules/financial-base/engine/reconciliation";
import { monthPeriod } from "@/modules/financial-base";
import {
  MMetricGrid,
  MMetricCard,
  MSectionHeader,
  MEmptyState,
  mAmount,
} from "../../components/content-kit";

import { MobileTxnList } from "./mobile-txn-list";
import { RevisionInbox } from "./revision-inbox";
import { RulesManager } from "./rules-manager";
import { AccountsManager } from "./accounts-manager";
import { TemplatesManager } from "./templates-manager";
import { CsvImport } from "./csv-import";
import { MobileHeader } from "../../components/mobile-header";

/**
 * /m/transacciones — paridad con la web /transacciones ("Transacciones", nombre exacto
 * de nav.ts) y data-screen="transacciones" del diseño. Bandeja "Por ordenar" (por revisar /
 * por clasificar / conciliar) + franja de resumen + lista con filtro. Reutiliza la MISMA
 * orquestación que la web (loadBaseView + selectUncategorized + findUnlinkedCandidates +
 * listMyPendingProposals), sin reimplementar consultas. es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileTransacciones() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          {/* Le faltaba el header: sin título ni forma de volver (mismo hueco que tenía
              Mi Base Financiera). */}
          <MobileHeader
            variant="inner"
            eyebrow="Movimientos"
            title="Transacciones"
            backHref="/m"
            backLabel="Volver a Inicio"
          />
          <MEmptyState
            icon="transfer"
            title="Aquí verás cada movimiento"
            description="Todo lo que entra y sale aparece en esta lista: podrás filtrarlo, clasificarlo y corregir lo que haga falta."
            actionLabel="Registrar un gasto"
            actionHref="/m/gastos"
          />
        </div>
      </div>
    );
  }

  const { real, currency, transactions, categoryNames, period, accounts, templates } = view;
  const net = real.freeCashflowReal;

  // Frascos para el selector de categoría (sobre) del registro de gastos (misma
  // orquestación que /m/gastos; excluye los frascos vinculados).
  const now = new Date();
  const jarsPeriod = monthPeriod(now.getFullYear(), now.getMonth() + 1);
  const jars = await getExpenseJarsAsOf({
    tree: view.tree,
    period: jarsPeriod,
    asOf: now.toISOString().slice(0, 10),
    currency,
  });

  // Bandeja "Por ordenar" — mismas fuentes que la web (cero consultas nuevas):
  //  · propuestas de ingesta (best-effort: si falla la lectura, la página no se rompe);
  //  · movimientos sin sobre + hojas de categoría seleccionables;
  //  · candidatos sin vincular + alertas plan-vs-real por entidad.
  let proposals: PendingProposalView[] = [];
  try {
    proposals = await listMyPendingProposals();
  } catch {
    proposals = [];
  }
  const uncategorized = selectUncategorized(transactions);
  const selectableCategories = selectableCategoryLeaves(view.categories);
  // Categorías de ingreso (mismas que el composer web) para exigir categoría en el ingreso manual.
  const incomeCats = view.incomeTree.flatMap((g) => g.children).map((c) => ({ id: c.id, name: c.name }));
  const incomeGroupId = view.incomeTree[0]?.id ?? null;
  const candidates = findUnlinkedCandidates(transactions, view.categories, view.linkables);
  const alerts = buildEntityAlerts(view.budget.items, transactions, currency, view.rates);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        {/* Mismo caso que Mi Base Financiera: sin la barra de pestañas se quedó sin
            ninguna salida a Inicio. El logo C+ es el destino; una flecha mentiría. */}
        <MobileHeader
          variant="inner"
          home
          eyebrow={`Movimientos · ${period.label}`}
          title="Transacciones"
        />
        <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 14 }}>
          Todos tus movimientos del periodo.
        </div>

        {/* Franja de resumen (misma que la web: saldo neto, ingresos, gastos, movimientos).
            La celda mide ~106px útiles a 320px → mAmount con umbral corto: antes usaba
            clamp() para encoger la fuente, que a partir de cierto importe ya no salva nada.
            El signo va delante del símbolo (formatMoney antepone ₡) y en cero no hay signo. */}
        <MSectionHeader title="Tu periodo en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard
            label="Saldo neto"
            value={`${net > 0 ? "+" : net < 0 ? "−" : ""}${mAmount(Math.abs(net), currency, 7)}`}
            sub="del periodo"
            tone={net > 0 ? "success" : net < 0 ? "danger" : "neutral"}
          />
          <MMetricCard
            label="Movimientos"
            value={String(real.count)}
            sub={`${mAmount(real.avgDaily, currency, 9)}/día`}
          />
          <MMetricCard
            label="Ingresos"
            value={mAmount(real.realIncome, currency, 8)}
            sub="este mes"
            tone="success"
          />
          <MMetricCard
            label="Gastos"
            value={mAmount(real.realExpense, currency, 8)}
            sub="este mes"
            tone="danger"
          />
        </MMetricGrid>

        {/* Bandeja de revisión y conciliación (arriba de la lista, sin alterarla). */}
        <RevisionInbox
          proposals={proposals}
          uncategorized={uncategorized}
          categories={selectableCategories}
          candidates={candidates}
          linkables={view.linkables}
          alerts={alerts}
        />

        {/* Reglas de auto-categorización (mismo panel que la web, sin backend nuevo). */}
        <RulesManager rules={view.rules} categories={selectableCategories} />

        {/* Cuentas (CRUD) + transferencias entre cuentas, con las Server Actions ya existentes. */}
        <AccountsManager accounts={accounts} currency={currency} />

        {/* Plantillas: registrar en un toque lo recurrente (runTemplateAction, sin backend nuevo). */}
        <TemplatesManager
          templates={templates}
          categories={selectableCategories}
          accounts={accounts}
          currency={currency}
        />

        {/* Importar CSV: mismo parser (engine/csv-parse) y misma acción que la web. */}
        <CsvImport currency={currency} />

        <MobileTxnList
          transactions={transactions}
          categoryNames={categoryNames}
          categories={selectableCategories}
          currency={currency}
          periodLabel={period.label}
          jars={jars}
          accounts={accounts}
          incomeCats={incomeCats}
          incomeGroupId={incomeGroupId}
        />
      </div>
    </div>
  );
}
