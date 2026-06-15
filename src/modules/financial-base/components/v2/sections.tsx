/**
 * Secciones (tabs) de Base Financiera V2 — componentes de presentación (servidor).
 * Reciben los datos ya calculados desde la página. Sincronización: lo real sale
 * de transactions; el presupuesto de budget_items.
 */
import { formatMoney, formatPercent } from "@/lib/format";
import { MetricCard, type MetricTone } from "@/components/shared/metric-card";
import {
  FinancialInsightCard,
  type FinancialReading,
} from "@/components/shared/financial-insight-card";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { PremiumLineChart, PerformanceChart } from "@/components/charts/lazy";
import { TransactionsBrowser } from "@/modules/financial-base/components/v2/transactions-browser";
import { IncomeSources } from "@/modules/financial-base/components/v2/income-sources";
import { IncomeRangeFilter } from "@/modules/financial-base/components/v2/income-range-filter";
import { RegisterIncomeButton } from "@/modules/financial-base/components/v2/register-income-button";
import { ExpenseJars } from "@/modules/financial-base/components/v2/expense-jars/expense-jars";
import { ExpenseToolbar } from "@/modules/financial-base/components/v2/expense-jars/expense-toolbar";
import { SummaryStrip, type SumCard } from "@/modules/financial-base/components/v2/summary-strip";
import { ComposerButton } from "@/modules/financial-base/components/v2/composer-button";
import { CategoryManagerButton } from "@/modules/financial-base/components/v2/category-manager";
import { RulesButton } from "@/modules/financial-base/components/v2/rules-panel";
import { ReconciliationCard } from "@/modules/financial-base/components/v2/reconciliation-card";
import {
  findUnlinkedCandidates,
  buildEntityAlerts,
} from "@/modules/financial-base/engine/reconciliation";
import { ScanReceiptButton } from "@/modules/financial-base/components/v2/scan-receipt-button";
import { CsvImportButton } from "@/modules/financial-base/components/v2/csv-import-modal";
import { TransferButton } from "@/modules/financial-base/components/v2/transfer-modal";
import type { TransactionRule } from "@/modules/financial-base/services/rules-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { SuggestionEntry } from "@/modules/financial-base/services/suggestion-service";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";
import {
  composition,
  computeV2Totals,
  topRows,
  type TopRow,
} from "@/modules/financial-base/engine/base-v2";
import type { BudgetTotals } from "@/modules/financial-base/services/budget-service";
import type {
  RealTotals,
  HistoryPoint,
} from "@/modules/financial-base/services/transaction-service";
import type { Category } from "@/modules/financial-base/services/categories-service";
import type {
  Account,
  FinancialPressure,
  Period,
  Transaction,
} from "@/modules/financial-base/types";
import { monthParam, type RangeKey } from "@/modules/financial-base/engine/period";

const PALETTE = [
  "var(--pos)",
  "var(--info)",
  "var(--gold)",
  "var(--teal)",
  "var(--c-networth)",
  "var(--warn)",
  "var(--c-protect)",
  "var(--muted-2)",
];

const PRESSURE: Record<FinancialPressure, { label: string; tone: MetricTone }> = {
  baja: { label: "Baja", tone: "pos" },
  media: { label: "Media", tone: "warn" },
  alta: { label: "Alta", tone: "neg" },
  critica: { label: "Crítica", tone: "neg" },
};

export type V2View = {
  period: Period;
  range?: RangeKey;
  currency: string;
  budget: BudgetTotals;
  real: RealTotals;
  history: HistoryPoint[];
  financialPressure: FinancialPressure;
  transactions: Transaction[];
  categories: Category[];
  tree: CategoryNode[];
  incomeTree: CategoryNode[];
  suggestions: SuggestionEntry[];
  templates: TransactionTemplate[];
  accounts: Account[];
  categoryNames: Record<string, string>;
  rules: TransactionRule[];
  linkables: LinkableEntities;
  jars: Jar[];
  baseReading: FinancialReading;
  incomeCapsule: FinancialReading;
  expenseCapsule: FinancialReading;
};

function donutData(map: Record<string, { label: string; value: number }>): DonutDatum[] {
  return composition(map).map((s, i) => ({
    name: s.label,
    value: Math.round(s.value),
    color: PALETTE[i % PALETTE.length]!,
  }));
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="card-title">{title}</div>
        {hint ? (
          <span className="muted" style={{ fontSize: 11.5 }}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function TopTable({
  title,
  rows,
  currency,
  dimLabel,
}: {
  title: string;
  rows: TopRow[];
  currency: string;
  dimLabel: string;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
      </div>
      <div
        className="list-row"
        style={{
          gridTemplateColumns: "1.4fr 1fr 1fr 0.7fr",
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        <span>{dimLabel}</span>
        <span style={{ textAlign: "right" }}>Presup.</span>
        <span style={{ textAlign: "right" }}>Real</span>
        <span style={{ textAlign: "right" }}>%</span>
      </div>
      {rows.length === 0 ? (
        <div className="muted" style={{ padding: "16px 24px", fontSize: 13 }}>
          Sin datos aún.
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.key}
            className="list-row"
            style={{ gridTemplateColumns: "1.4fr 1fr 1fr 0.7fr" }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.label}
            </span>
            <span className="tnum muted" style={{ textAlign: "right", fontSize: 12.5 }}>
              {formatMoney(r.budget, currency)}
            </span>
            <span className="tnum" style={{ textAlign: "right", fontSize: 12.5, fontWeight: 500 }}>
              {formatMoney(r.real, currency)}
            </span>
            <span
              className="tnum"
              style={{
                textAlign: "right",
                fontSize: 12.5,
                color:
                  r.status === "over"
                    ? "var(--neg)"
                    : r.status === "warn"
                      ? "var(--warn)"
                      : "var(--pos)",
              }}
            >
              {formatPercent(r.sharePct)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function tone(v: number, goodWhenPositive = true): MetricTone {
  if (Math.abs(v) < 0.001) return "neutral";
  return v > 0 === goodWhenPositive ? "pos" : "warn";
}

// ============================== MI BASE ==============================
export function MiBaseSection({ view }: { view: V2View }) {
  const { budget, real, currency, history } = view;
  const t = computeV2Totals({
    budgetIncome: budget.budgetIncome,
    realIncome: real.realIncome,
    budgetExpense: budget.budgetExpense,
    realExpense: real.realExpense,
  });
  const incomeLine = history.map((h) => ({
    label: h.label,
    Real: h.realIncome,
    Presupuesto: h.budgetIncome || Math.round(budget.budgetIncome),
  }));
  const expenseLine = history.map((h) => ({
    label: h.label,
    Real: h.realExpense,
    Presupuesto: h.budgetExpense || Math.round(budget.budgetExpense),
  }));
  const flujoLine = history.map((h) => ({
    label: h.label,
    Ingresos: h.realIncome,
    Gastos: h.realExpense,
    "Flujo libre": h.freeCashflow,
  }));
  const press = PRESSURE[view.financialPressure];

  return (
    <div className="grid">
      <section className="cols-4">
        <MetricCard
          label="Ingresos presup."
          value={formatMoney(budget.budgetIncome, currency)}
          sub="presupuesto del mes"
        />
        <MetricCard
          label="Ingresos reales"
          value={formatMoney(real.realIncome, currency)}
          delta={`${t.incomeVariancePct >= 0 ? "+" : ""}${formatPercent(t.incomeVariancePct)} vs presup.`}
          deltaTone={tone(t.incomeVariancePct)}
          valueTone="pos"
        />
        <MetricCard
          label="Gastos presup."
          value={formatMoney(budget.budgetExpense, currency)}
          sub="presupuesto del mes"
        />
        <MetricCard
          label="Gastos reales"
          value={formatMoney(real.realExpense, currency)}
          delta={`${t.expenseVariancePct >= 0 ? "+" : ""}${formatPercent(t.expenseVariancePct)} vs presup.`}
          deltaTone={tone(t.expenseVariancePct, false)}
          valueTone="neg"
        />
      </section>
      <section className="cols-4">
        <MetricCard
          label="Flujo libre real"
          value={formatMoney(t.freeCashflowReal, currency)}
          sub="ingresos − gastos"
          valueTone={t.freeCashflowReal >= 0 ? "pos" : "neg"}
        />
        <MetricCard
          label="% flujo libre"
          value={formatPercent(t.freeCashflowPct)}
          valueTone={t.freeCashflowPct >= 0 ? "pos" : "neg"}
        />
        <MetricCard
          label="Ratio gasto/ingreso"
          value={t.expenseRatio.toFixed(2)}
          sub="objetivo < 0.80"
          valueTone={t.expenseRatio < 0.8 ? "pos" : "warn"}
        />
        <MetricCard label="Presión financiera" value={press.label} valueTone={press.tone} />
      </section>

      <section className="cols-2">
        <ChartCard title="A · Ingresos reales vs presupuestados" hint="por mes">
          <PremiumLineChart
            data={incomeLine}
            xKey="label"
            currency={currency}
            series={[
              { key: "Presupuesto", label: "Presupuesto", color: "var(--muted-2)", dashed: true },
              { key: "Real", label: "Real", color: "var(--pos)" },
            ]}
          />
        </ChartCard>
        <ChartCard title="B · Gastos reales vs presupuestados" hint="por mes">
          <PremiumLineChart
            data={expenseLine}
            xKey="label"
            currency={currency}
            series={[
              { key: "Presupuesto", label: "Presupuesto", color: "var(--muted-2)", dashed: true },
              { key: "Real", label: "Real", color: "var(--c-expense)" },
            ]}
          />
        </ChartCard>
      </section>

      <ChartCard title="C · Flujo de caja libre mensual" hint="ingresos · gastos · flujo">
        <PremiumLineChart
          data={flujoLine}
          xKey="label"
          currency={currency}
          series={[
            { key: "Ingresos", label: "Ingresos", color: "var(--pos)" },
            { key: "Gastos", label: "Gastos", color: "var(--c-expense)" },
            { key: "Flujo libre", label: "Flujo libre", color: "var(--info)" },
          ]}
        />
      </ChartCard>

      <section className="cols-2">
        <DonutCard
          title="D · Composición de ingresos"
          data={donutData(real.incomeByKey)}
          total={real.realIncome}
          currency={currency}
        />
        <DonutCard
          title="E · Composición de gastos"
          data={donutData(real.expenseByKey)}
          total={real.realExpense}
          currency={currency}
        />
      </section>

      <section className="cols-2">
        <TopTable
          title="Top 10 ingresos"
          rows={topRows(budget.incomeByKey, real.incomeByKey, { kind: "income", limit: 10 })}
          currency={currency}
          dimLabel="Fuente"
        />
        <TopTable
          title="Top 10 gastos"
          rows={topRows(budget.expenseByKey, real.expenseByKey, { kind: "expense", limit: 10 })}
          currency={currency}
          dimLabel="Categoría"
        />
      </section>

      <FinancialInsightCard reading={view.baseReading} />
    </div>
  );
}

function DonutCard({
  title,
  data,
  total,
  currency,
}: {
  title: string;
  data: DonutDatum[];
  total: number;
  currency: string;
}) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}
      >
        <DonutChart data={data} centerLabel={formatMoney(total, currency)} centerSub="al mes" />
        <div style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 7 }}>
          {data.length === 0 ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Sin datos este mes.
            </span>
          ) : (
            data.map((d) => (
              <div
                key={d.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "10px 1fr auto",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12.5,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span
                  style={{
                    color: "var(--ink-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.name}
                </span>
                <span className="muted tnum">{formatMoney(d.value, currency)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================== INGRESOS / GASTOS ==============================
export function IncomeExpenseSection({ view, kind }: { view: V2View; kind: "income" | "expense" }) {
  if (kind === "income") return <IncomeSection view={view} />;

  // ----- Gastos (sin cambios) -----
  const { budget, real, currency, history } = view;
  const budgetTotal = budget.budgetExpense;
  const realTotal = real.realExpense;
  const diff = realTotal - budgetTotal;
  const complPct = budgetTotal > 0 ? realTotal / budgetTotal : 0;
  const items = budget.items.filter((b) => b.type === "expense");
  const lineData = history.map((h) => ({
    label: h.label,
    Real: h.realExpense,
    Presupuesto: h.budgetExpense || Math.round(budgetTotal),
  }));

  const summary: SumCard[] = [
    {
      ttl: "Gasto planificado",
      val: formatMoney(budgetTotal, currency),
      sub: `${items.length} categoría(s)`,
    },
    { ttl: "Gasto real", val: formatMoney(realTotal, currency), sub: "hasta hoy" },
    {
      ttl: "Diferencia",
      val: `${diff >= 0 ? "+" : ""}${formatMoney(diff, currency)}`,
      sub: "real − planificado",
      tone: diff <= 0 ? "pos" : "neg",
    },
    { ttl: "% ejecución", val: formatPercent(complPct), sub: "del presupuesto" },
  ];

  return (
    <div className="grid">
      <div className="tab-toolbar">
        <div className="hint">Tus gastos por categoría, comparados con tu presupuesto del mes.</div>
      </div>

      <SummaryStrip cards={summary} />

      <section className="cols-2">
        <ChartCard title="Histórico de gastos" hint="real vs presupuesto">
          <PremiumLineChart
            data={lineData}
            xKey="label"
            currency={currency}
            series={[
              { key: "Presupuesto", label: "Presupuesto", color: "var(--muted-2)", dashed: true },
              { key: "Real", label: "Real", color: "var(--c-expense)" },
            ]}
          />
        </ChartCard>
        <DonutCard
          title="Composición por categoría"
          data={donutData(real.expenseByKey)}
          total={realTotal}
          currency={currency}
        />
      </section>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Categorías de gasto</div>
            <div className="card-sub">Frascos por bloque · este mes</div>
          </div>
          <ExpenseToolbar
            jars={view.jars}
            accounts={view.accounts}
            currency={currency}
            period={view.period}
            tree={view.tree}
          />
        </div>
        <ExpenseJars jars={view.jars} currency={currency} period={view.period} />
      </div>

      <FinancialInsightCard reading={view.expenseCapsule} />
    </div>
  );
}

// ── Tab de Ingresos (Fase 1): orden toolbar · rango · cuadros · histórico/
//    composición · Área "Ingreso" (fuentes con barra buffer) · insight. ──
function IncomeSection({ view }: { view: V2View }) {
  const { budget, real, currency, history, period } = view;
  const range = view.range ?? "1m";
  const rangeActive = range !== "1m";
  const incomeItems = budget.items.filter((b) => b.type === "income");

  // Cuadros: agregan sobre el rango elegido (suma del histórico); en "1 mes"
  // se usan los totales del periodo actual (comportamiento de siempre).
  const realIncome = rangeActive
    ? history.reduce((s, h) => s + h.realIncome, 0)
    : real.realIncome;
  const budgetIncome = rangeActive
    ? history.reduce((s, h) => s + h.budgetIncome, 0)
    : budget.budgetIncome;
  const diff = realIncome - budgetIncome;
  const complPct = budgetIncome > 0 ? realIncome / budgetIncome : 0;

  const incomeArea = history.map((h) => ({ date: h.label, value: h.realIncome }));

  const summary: SumCard[] = [
    {
      ttl: "Ingresos planificados",
      val: formatMoney(budgetIncome, currency),
      sub: rangeActive ? "en el rango" : `${incomeItems.length} fuente(s)`,
      tone: "pos",
    },
    {
      ttl: "Ingresos totales",
      val: formatMoney(realIncome, currency),
      sub: rangeActive ? "recibido en el rango" : "recibido este mes",
      tone: "pos",
    },
    {
      ttl: "Diferencia",
      val: `${diff >= 0 ? "+" : ""}${formatMoney(diff, currency)}`,
      sub: "real − planificado",
      tone: diff >= 0 ? "pos" : "neg",
    },
    { ttl: "% cumplimiento", val: formatPercent(complPct), sub: "de lo planificado" },
  ];

  return (
    <div className="grid">
      <div className="tab-toolbar">
        <div className="hint">Tus ingresos se registran aquí; confírmalos cuando los recibas.</div>
        <RegisterIncomeButton currency={currency} />
      </div>

      <div className="tab-toolbar">
        <div className="hint">Rango de los cuadros y el histórico</div>
        <IncomeRangeFilter range={range} periodParam={monthParam(period)} />
      </div>

      <SummaryStrip cards={summary} />

      <section className="cols-2">
        <ChartCard title="Histórico de ingresos" hint="real vs presupuesto">
          <PerformanceChart
            data={incomeArea}
            currency={currency}
            tone="pos"
            goalValue={Math.round(budget.budgetIncome)}
            height={160}
          />
        </ChartCard>
        <DonutCard
          title="Composición por fuente"
          data={donutData(real.incomeByKey)}
          total={real.realIncome}
          currency={currency}
        />
      </section>

      <IncomeSources
        items={incomeItems}
        confirmedByKey={real.incomeConfirmedByKey}
        currency={currency}
      />

      <FinancialInsightCard reading={view.incomeCapsule} />
    </div>
  );
}

// ============================== TRANSACCIONES ==============================
export function TransaccionesSection({ view }: { view: V2View }) {
  const { real, currency } = view;
  const summary: SumCard[] = [
    {
      ttl: "Saldo neto",
      val: formatMoney(real.freeCashflowReal, currency),
      sub: "del periodo",
      tone: real.freeCashflowReal >= 0 ? "pos" : "neg",
    },
    { ttl: "Ingresos", val: formatMoney(real.realIncome, currency), sub: "este mes", tone: "pos" },
    { ttl: "Gastos", val: formatMoney(real.realExpense, currency), sub: "este mes", tone: "neg" },
    {
      ttl: "Movimientos",
      val: String(real.count),
      sub: `${formatMoney(real.avgDaily, currency)}/día prom.`,
    },
  ];

  return (
    <div className="grid">
      <SummaryStrip cards={summary} />

      <div className="tab-toolbar">
        <div className="hint">Busca, filtra y gestiona todos tus movimientos del mes.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <ComposerButton
            tree={view.tree}
            incomeTree={view.incomeTree}
            accounts={view.accounts}
            currency={currency}
            suggestions={view.suggestions}
            templates={view.templates}
            linkables={view.linkables}
          />
          <ScanReceiptButton
            categories={view.categories}
            accounts={view.accounts}
            currency={currency}
          />
          <CsvImportButton currency={currency} />
          <TransferButton accounts={view.accounts} currency={currency} />
          <CategoryManagerButton tree={view.tree} />
          <RulesButton rules={view.rules} categories={view.categories} accounts={view.accounts} />
        </div>
      </div>

      <TransactionsBrowser
        transactions={view.transactions}
        categoryNames={view.categoryNames}
        categories={view.categories}
        accounts={view.accounts}
        currency={currency}
        period={view.period.label}
      />

      {/* Conciliación (Fase 6): sin-vincular + plan-vs-real por entidad. */}
      <ReconciliationCard
        candidates={findUnlinkedCandidates(view.transactions, view.categories, view.linkables)}
        alerts={buildEntityAlerts(view.budget.items, view.transactions)}
        linkables={view.linkables}
      />

      {view.transactions.length > 0 ? (
        <div
          className="card card-pad"
          style={{ borderColor: "color-mix(in srgb, var(--info) 35%, var(--line))" }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              fontSize: 13.5,
              color: "var(--ink-2)",
            }}
          >
            <span style={{ color: "var(--info)" }}>●</span>
            {real.topExpenseCategory
              ? `Tu mayor gasto del periodo es "${real.topExpenseCategory}". Registrar todo te ayuda a detectar fugas hormiga.`
              : "Asigna categorías a tus movimientos para ver patrones útiles."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
