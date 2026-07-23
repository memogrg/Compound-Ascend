/**
 * Secciones (tabs) de Base Financiera V2 — componentes de presentación (servidor).
 * Reciben los datos ya calculados desde la página. Sincronización: lo real sale
 * de transactions; el presupuesto de budget_items.
 */
import { formatMoney, formatPercent, formatCompact } from "@/lib/format";
import { convertCurrency } from "@/lib/fx";
import { MetricCard, type MetricTone } from "@/components/shared/metric-card";
import {
  FinancialInsightCard,
  type FinancialReading,
} from "@/components/shared/financial-insight-card";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { PremiumLineChart, PerformanceChart } from "@/components/charts/lazy";
import { LiquidityCard } from "@/modules/financial-base/components/v2/liquidity-card";
import { TransactionsBrowser } from "@/modules/financial-base/components/v2/transactions-browser";
import { IncomeSources } from "@/modules/financial-base/components/v2/income-sources";
import { IncomeRangeFilter } from "@/modules/financial-base/components/v2/income-range-filter";
import { RegisterIncomeButton } from "@/modules/financial-base/components/v2/register-income-button";
import { CopyPreviousIncomeButton } from "@/modules/financial-base/components/v2/copy-previous-income-button";
import { LinkedIncomeCard } from "@/modules/financial-base/components/v2/linked-income-card";
import { ExpenseJars } from "@/modules/financial-base/components/v2/expense-jars/expense-jars";
import { ExpenseToolbar } from "@/modules/financial-base/components/v2/expense-jars/expense-toolbar";
import type { CreateSavingsSobre } from "@/modules/financial-base/components/v2/expense-jars/new-savings-sobre-modal";
import { JarDatePicker } from "@/modules/financial-base/components/v2/expense-jars/jar-date-picker";
import { ExpenseRangeControl } from "@/modules/financial-base/components/v2/expense-range-control";
import { SummaryStrip, type SumCard } from "@/modules/financial-base/components/v2/summary-strip";
import { ComposerButton } from "@/modules/financial-base/components/v2/composer-button";
import { CategoryManagerButton } from "@/modules/financial-base/components/v2/category-manager";
import { RulesButton } from "@/modules/financial-base/components/v2/rules-panel";
import { ReconciliationCard } from "@/modules/financial-base/components/v2/reconciliation-card";
import { PorClasificarCard } from "@/modules/financial-base/components/v2/por-clasificar-card";
import {
  selectUncategorized,
  selectableCategoryLeaves,
} from "@/modules/financial-base/engine/classify";
import { getSuggestionsFor } from "@/modules/financial-base/services/ai-categorize";
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
import type {
  Category,
  CategoryPersonalization,
} from "@/modules/financial-base/services/categories-service";
import type {
  Account,
  BudgetItem,
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
  /** Tasas FX a la moneda de display, para convertir agregados nativos. */
  rates: Record<string, number>;
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
  /** Personalización por hogar (Fase 2): puede el usuario editar + estado actual. */
  canPersonalize: boolean;
  personalization: CategoryPersonalization;
  /** Saco de Liquidez ("Tu Liquidez"): saldo real disponible + si ya hay apertura. */
  liquidity: { balance: number; currency: string; hasOpening: boolean };
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
        className="list-row tbl-h"
        style={{ gridTemplateColumns: "1.4fr 1fr 1fr 0.7fr" }}
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
            <span style={{ textAlign: "right" }}>
              <span
                className={`pctb ${r.status === "over" ? "r" : r.status === "warn" ? "a" : "g"}`}
              >
                {formatPercent(r.sharePct)}
              </span>
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
  const flujoLine = history.map((h) => ({
    label: h.label,
    Ingresos: h.realIncome,
    Gastos: h.realExpense,
    "Flujo libre": h.freeCashflow,
  }));
  const press = PRESSURE[view.financialPressure];

  return (
    <div className="grid">
      <LiquidityCard
        balance={view.liquidity.balance}
        currency={view.liquidity.currency}
        hasOpening={view.liquidity.hasOpening}
      />
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
          <PerformanceChart
            data={history.map((h) => ({ date: h.label, value: h.realIncome }))}
            currency={currency}
            tone="pos"
            goalValue={Math.round(budget.budgetIncome)}
            height={160}
            axes="full"
          />
        </ChartCard>
        <ChartCard title="B · Gastos reales vs presupuestados" hint="por mes">
          <PerformanceChart
            data={history.map((h) => ({ date: h.label, value: h.realExpense }))}
            currency={currency}
            tone="neg"
            goalValue={Math.round(budget.budgetExpense)}
            height={160}
            axes="full"
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
        <DonutChart data={data} centerLabel={formatCompact(total, currency)} centerSub="al mes" />
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
export function IncomeExpenseSection({
  view,
  kind,
  jarsAsOf,
  jarsPeriod,
  range,
  createSavingsSobre,
}: {
  view: V2View;
  kind: "income" | "expense";
  /** Solo Gastos: fecha de corte (YYYY-MM-DD) y periodo que scopean los frascos. */
  jarsAsOf?: string;
  jarsPeriod?: Period;
  /** Solo Gastos: rango activo (1m/3m/6m/ytd/all) de las cards y gráficas. */
  range?: string;
  /** Solo Gastos: server action para crear un sobre de ahorro desde la toolbar. */
  createSavingsSobre?: CreateSavingsSobre;
}) {
  if (kind === "income") return <IncomeSection view={view} />;

  // ----- Gastos -----
  const { budget, real, currency, history } = view;
  // Los frascos se scopean por su propio filtro de fecha; el resto (cards y
  // gráficas) conserva su scope. Fallback al periodo de la vista.
  const jarPeriod = jarsPeriod ?? view.period;
  const budgetTotal = budget.budgetExpense;
  const realTotal = real.realExpense;
  const diff = realTotal - budgetTotal;
  const complPct = budgetTotal > 0 ? realTotal / budgetTotal : 0;
  const items = budget.items.filter((b) => b.type === "expense");

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
        <ExpenseRangeControl current={range ?? "1m"} />
      </div>

      <SummaryStrip cards={summary} />

      <section className="cols-2">
        <ChartCard title="Histórico de gastos" hint="real vs presupuesto">
          <PerformanceChart
            data={history.map((h) => ({ date: h.label, value: h.realExpense }))}
            currency={currency}
            tone="neg"
            goalValue={Math.round(budgetTotal)}
            height={160}
            axes="full"
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
            <div className="card-sub">Frascos por bloque · gasto real al día elegido</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {jarsAsOf ? <JarDatePicker current={jarsAsOf} /> : null}
            <ExpenseToolbar
              jars={view.jars}
              accounts={view.accounts}
              currency={currency}
              period={jarPeriod}
              tree={view.tree}
              canPersonalize={view.canPersonalize}
              personalization={view.personalization}
              createSavingsSobre={createSavingsSobre}
            />
          </div>
        </div>
        <ExpenseJars
          jars={view.jars}
          currency={currency}
          period={jarPeriod}
          categories={view.categories}
          canPersonalize={view.canPersonalize}
          personalization={view.personalization}
        />
      </div>

      <FinancialInsightCard reading={view.expenseCapsule} />
    </div>
  );
}

// ── Tab de Ingresos (Fase 1): orden toolbar · rango · cuadros · histórico/
//    composición · Área "Ingreso" (fuentes con barra buffer) · insight. ──
function IncomeSection({ view }: { view: V2View }) {
  const { budget, real, currency, rates, history, period } = view;
  const range = view.range ?? "1m";
  const incomeItems = budget.items.filter((b) => b.type === "income");

  // Fantasma-fix (Parte 1): cuadros y barras SOLO desde fuentes manuales no
  // vinculadas a inversiones; lo vinculado va a su sección read-only. Así nada
  // queda contado-pero-invisible en este tab (Mi Base/Transacciones ven todo).
  const isLinked = (b: BudgetItem) =>
    Boolean(b.holdingId) || b.sourceKind === "dividend" || b.sourceKind === "rental";
  const manualSources = incomeItems.filter(
    (b) => (b.sourceKind ?? "manual") === "manual" && !isLinked(b),
  );
  const linkedSources = incomeItems.filter(isLinked);
  const receivedOf = (b: BudgetItem) => real.incomeReceivedBySource[b.id] ?? 0;

  // Agregados: una sola moneda (display). El planificado se convierte igual que
  // el recibido (que ya viene convertido en incomeReceivedBySource) para que
  // "Diferencia" y "% cumplimiento" comparen sobre la misma base.
  const conv = (b: BudgetItem) => convertCurrency(b.amount, b.currency, currency, rates);
  // El ingreso vinculado a inversiones (renta + dividendos) es un estimado
  // recurrente que SÍ suma al total del mes. Si hay pago real conciliado
  // (Recibido > 0) se usa ese; si no, el estimado planificado.
  const linkedValueOf = (b: BudgetItem) => {
    const r = receivedOf(b);
    return r > 0 ? r : conv(b);
  };
  const budgetIncome =
    manualSources.reduce((s, b) => s + conv(b), 0) +
    linkedSources.reduce((s, b) => s + conv(b), 0);
  const realIncome =
    manualSources.reduce((s, b) => s + receivedOf(b), 0) +
    linkedSources.reduce((s, b) => s + linkedValueOf(b), 0);
  const diff = realIncome - budgetIncome;
  const complPct = budgetIncome > 0 ? realIncome / budgetIncome : 0;

  // Histórico: tendencia mensual (controlada por el rango). Composición: por
  // fuente (manual recibida + inversión), coherente con los cuadros.
  const incomeArea = history.map((h) => ({ date: h.label, value: h.realIncome }));
  const incomeByManualSource: Record<string, { label: string; value: number }> = {};
  for (const b of manualSources) {
    const v = receivedOf(b);
    if (v > 0) incomeByManualSource[b.id] = { label: b.name, value: v };
  }
  for (const b of linkedSources) {
    const v = linkedValueOf(b);
    if (v > 0) incomeByManualSource[b.id] = { label: b.name, value: v };
  }

  const summary: SumCard[] = [
    {
      ttl: "Ingresos planificados",
      val: formatMoney(budgetIncome, currency),
      sub: `${manualSources.length + linkedSources.length} fuente(s)`,
      tone: "pos",
    },
    {
      ttl: "Ingresos totales",
      val: formatMoney(realIncome, currency),
      sub: "recibido + inversiones",
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
        <div className="hint">Rango del histórico</div>
        <IncomeRangeFilter range={range} periodParam={monthParam(period)} />
      </div>

      <SummaryStrip cards={summary} />

      <section className="cols-2">
        <ChartCard title="Histórico de ingresos" hint="recibido por mes">
          <PerformanceChart
            data={incomeArea}
            currency={currency}
            tone="pos"
            goalValue={Math.round(budgetIncome)}
            height={160}
            axes="full"
          />
        </ChartCard>
        <DonutCard
          title="Composición por fuente"
          data={donutData(incomeByManualSource)}
          total={realIncome}
          currency={currency}
        />
      </section>

      {/* Toolbar justo encima de la card de fuentes (Parte 3). */}
      <div className="tab-toolbar">
        <div className="hint">Tus ingresos se registran aquí; confírmalos cuando los recibas.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <CopyPreviousIncomeButton periodMonth={period.month} periodYear={period.year} />
          <RegisterIncomeButton incomeTree={view.incomeTree} />
        </div>
      </div>

      <IncomeSources
        items={manualSources}
        received={real.incomeReceivedBySourceNative}
        incomeTree={view.incomeTree}
      />

      {linkedSources.length > 0 ? (
        <LinkedIncomeCard items={linkedSources} received={real.incomeReceivedBySourceNative} />
      ) : null}

      <FinancialInsightCard reading={view.incomeCapsule} />
    </div>
  );
}

// ============================== TRANSACCIONES ==============================
export async function TransaccionesSection({ view }: { view: V2View }) {
  const { real, currency } = view;

  // Sugerencia de sobre por IA para los movimientos sin clasificar (best-effort, cacheada).
  const uncategorized = selectUncategorized(view.transactions);
  let suggested: Record<string, string> = {};
  try {
    const suggestions = await getSuggestionsFor(
      uncategorized.map((t) => ({
        id: t.id,
        merchant: t.merchantOrSource ?? t.description ?? null,
        kind: t.kind as "gasto" | "ingreso",
      })),
    );
    suggested = Object.fromEntries(
      [...suggestions].flatMap(([id, s]) => (s.categoryId ? [[id, s.categoryId] as const] : [])),
    );
  } catch {
    suggested = {}; // si la sugerencia falla, la lista funciona igual (sin pre-relleno).
  }
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
            suggestions={view.suggestions}
            templates={view.templates}
            linkables={view.linkables}
          />
          <ScanReceiptButton
            categories={view.categories}
            accounts={view.accounts}
            currency={currency}
          />
          <CsvImportButton />
          <TransferButton accounts={view.accounts} />
          <CategoryManagerButton
            tree={view.tree}
            canPersonalize={view.canPersonalize}
            personalization={view.personalization}
          />
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

      {/* Por clasificar: movimientos sin sobre (WhatsApp/ingesta sin regla). */}
      <PorClasificarCard
        items={uncategorized}
        categories={selectableCategoryLeaves(view.categories)}
        suggested={suggested}
      />

      {/* Conciliación (Fase 6): sin-vincular + plan-vs-real por entidad. */}
      <ReconciliationCard
        candidates={findUnlinkedCandidates(view.transactions, view.categories, view.linkables)}
        alerts={buildEntityAlerts(view.budget.items, view.transactions, view.currency, view.rates)}
        linkables={view.linkables}
      />

      {view.transactions.length > 0 ? (
        <div className="infobox">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16v-4M12 8h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <p>
            {real.topExpenseCategory
              ? `Tu mayor gasto del periodo es "${real.topExpenseCategory}". Registrar todo te ayuda a detectar fugas hormiga.`
              : "Asigna categorías a tus movimientos para ver patrones útiles."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
