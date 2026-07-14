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
import { formatMoney } from "@/lib/format";

import { MobileTxnList } from "./mobile-txn-list";
import { RevisionInbox } from "./revision-inbox";
import { RulesManager } from "./rules-manager";
import { AccountsManager } from "./accounts-manager";
import { TemplatesManager } from "./templates-manager";
import { MobileMenu } from "../../components/mobile-menu";

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
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no puedes ver tus transacciones. Registra un movimiento para empezar.
            </div>
          </div>
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
  const candidates = findUnlinkedCandidates(transactions, view.categories, view.linkables);
  const alerts = buildEntityAlerts(view.budget.items, transactions, currency, view.rates);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="between" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <div>
            <div className="ov">Movimientos · {period.label}</div>
            <div className="h-title" style={{ marginTop: 6 }}>
              Transacciones
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Todos tus movimientos del periodo.
            </div>
          </div>
          <MobileMenu />
        </div>

        {/* Franja de resumen (misma que la web: saldo neto, ingresos, gastos, movimientos) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Sum label="Saldo neto" value={`${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net), currency)}`} cls={net >= 0 ? "pos" : "neg"} sub="del periodo" />
          <Sum label="Movimientos" value={String(real.count)} sub={`${formatMoney(real.avgDaily, currency)}/día`} />
          <Sum label="Ingresos" value={formatMoney(real.realIncome, currency)} cls="pos" sub="este mes" />
          <Sum label="Gastos" value={formatMoney(real.realExpense, currency)} cls="neg" sub="este mes" />
        </div>

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

        <MobileTxnList
          transactions={transactions}
          categoryNames={categoryNames}
          categories={selectableCategories}
          currency={currency}
          periodLabel={period.label}
          jars={jars}
          accounts={accounts}
        />
      </div>
    </div>
  );
}

function Sum({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="card card-p" style={{ padding: 14 }}>
      <div className="ov">{label}</div>
      <div className={`mono ${cls ?? ""}`} style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
