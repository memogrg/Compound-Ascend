import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { DeleteButton } from "./delete-button";
import { EditItemButton } from "./base-actions";
import { EXPENSE_NATURES, NATURE_COLOR } from "@/modules/financial-base/constants";
import { formatMoney, formatPercent, formatCompact } from "@/lib/format";
import type { BaseSummary } from "@/modules/financial-base/services/base-service";
import type { ExpenseNature, IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

const PRESSURE_LABEL: Record<string, { label: string; cls: string }> = {
  baja: { label: "Baja", cls: "var(--pos)" },
  media: { label: "Media", cls: "var(--warn)" },
  alta: { label: "Alta", cls: "var(--neg)" },
  critica: { label: "Crítica", cls: "var(--neg)" },
};

const NATURE_LABEL = Object.fromEntries(EXPENSE_NATURES.map((n) => [n.value, n.label]));

export function BaseDashboard({ summary, currency }: { summary: BaseSummary; currency: string }) {
  const { indicators: ind, incomes, expenses } = summary;
  const pressure = PRESSURE_LABEL[ind.financialPressure] ?? PRESSURE_LABEL.baja!;

  const donutData: DonutDatum[] = (Object.entries(ind.expenseByNature) as [ExpenseNature, number][])
    .filter(([, v]) => v > 0)
    .map(([nature, value]) => ({
      name: NATURE_LABEL[nature] ?? nature,
      value,
      color: NATURE_COLOR[nature] ?? "var(--muted-2)",
    }));

  return (
    <div className="grid">
      {/* KPIs */}
      <section className="cols-4">
        <Kpi label="Ingresos mensualizados" value={formatMoney(ind.incomeMonthly, currency)} accent="var(--pos)" />
        <Kpi label="Gastos mensualizados" value={formatMoney(ind.expenseMonthly, currency)} accent="var(--c-expense)" />
        <Kpi
          label="Flujo libre mensual"
          value={formatMoney(ind.freeCashflow, currency)}
          accent={ind.freeCashflow >= 0 ? "var(--pos)" : "var(--neg)"}
        />
        <Kpi label="Presión financiera" value={pressure.label} accent={pressure.cls} />
      </section>

      <section className="cols-4">
        <Kpi label="Tasa de ahorro" value={formatPercent(ind.savingsRate)} accent="var(--c-savings)" small />
        <Kpi label="Tasa de inversión" value={formatPercent(ind.investmentRate)} accent="var(--c-invest)" small />
        <Kpi label="Peso de deuda" value={formatPercent(ind.debtWeight)} accent="var(--c-debt)" small />
        <Kpi label="Gastos esenciales" value={formatPercent(ind.essentialsWeight)} accent="var(--c-expense)" small />
      </section>

      {/* Donut + insight */}
      <section className="split-2-3">
        <div className="card card-pad">
          <div className="card-title">Composición de gastos</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
            <DonutChart
              data={donutData}
              centerLabel={formatCompact(ind.expenseMonthly, currency)}
              centerSub="al mes"
            />
            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 8 }}>
              {donutData.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  Agrega gastos para ver su composición.
                </span>
              ) : (
                donutData.map((d) => (
                  <div
                    key={d.name}
                    style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 9, alignItems: "center", fontSize: 12.5 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ color: "var(--ink-2)" }}>{d.name}</span>
                    <span className="muted tnum">{formatMoney(d.value, currency)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="eyebrow">Lectura</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>
            Tus ingresos mensualizados son <strong>{formatMoney(ind.incomeMonthly, currency)}</strong> y tus gastos{" "}
            <strong>{formatMoney(ind.expenseMonthly, currency)}</strong>, dejando un flujo libre de{" "}
            <strong style={{ color: ind.freeCashflow >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {formatMoney(ind.freeCashflow, currency)}
            </strong>{" "}
            al mes. {coverageNote(ind.annualCoverage, currency)}
          </p>
        </div>
      </section>

      {/* Listas */}
      <section className="split-3-2">
        <ItemCard title="Mis ingresos" sub={`${incomes.length} fuente(s)`}>
          {incomes.length === 0 ? (
            <Empty text="Aún no agregas ingresos." />
          ) : (
            incomes.map((i) => (
              <Row
                key={i.id}
                kind="income"
                item={i}
                currency={currency}
                sub={`${i.frequency} · ${i.incomeType}`}
                amount={`+${formatMoney(i.amountMonthly, i.currency)}/mes`}
                amountColor="var(--pos)"
              />
            ))
          )}
        </ItemCard>

        <ItemCard title="Mis gastos" sub={`${expenses.length} gasto(s)`}>
          {expenses.length === 0 ? (
            <Empty text="Aún no agregas gastos." />
          ) : (
            expenses.map((e) => (
              <Row
                key={e.id}
                kind="expense"
                item={e}
                currency={currency}
                sub={`${e.frequency} · ${NATURE_LABEL[e.nature] ?? e.nature}`}
                amount={`${formatMoney(e.amountMonthly, e.currency)}/mes`}
              />
            ))
          )}
        </ItemCard>
      </section>
    </div>
  );
}

function coverageNote(annual: number, currency: string): string {
  if (annual <= 0) return "";
  return `Reserva unos ${formatMoney(annual, currency)} al mes para gastos no mensuales y evita sorpresas.`;
}

function Kpi({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent: string;
  small?: boolean;
}) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
        <span className="label">{label}</span>
      </div>
      <div className="num-xl" style={{ fontSize: small ? 24 : 28, marginTop: 12 }}>
        {value}
      </div>
    </div>
  );
}

function ItemCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({
  kind,
  item,
  currency,
  sub,
  amount,
  amountColor,
}: {
  kind: "income" | "expense";
  item: IncomeSource | ExpenseItem;
  currency: string;
  sub: string;
  amount: string;
  amountColor?: string;
}) {
  return (
    <div className="list-row">
      <div className="li-icon" style={{ width: 34, height: 34, borderRadius: 9, background: "var(--chip)", display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{item.name.charAt(0).toUpperCase()}</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2, textTransform: "capitalize" }}>
          {sub}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500, color: amountColor }}>
          {amount}
        </span>
        <EditItemButton kind={kind} item={item} currency={currency} />
        <DeleteButton id={item.id} kind={kind} />
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
      {text}
    </div>
  );
}
