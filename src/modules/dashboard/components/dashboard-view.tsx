import Link from "next/link";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatCompact } from "@/lib/format";
import { EXPENSE_NATURES, NATURE_COLOR } from "@/modules/financial-base/constants";
import type { BaseSummary } from "@/modules/financial-base";
import type { HealthScore } from "@/modules/financial-base";
import type { DashboardInsights } from "@/modules/dashboard/engine/insights";
import type { ExpenseNature } from "@/modules/financial-base";

const NATURE_LABEL = Object.fromEntries(EXPENSE_NATURES.map((n) => [n.value, n.label]));

export function DashboardView({
  name,
  summary,
  currency,
  health,
  insights,
  demo = false,
}: {
  name: string;
  summary: BaseSummary;
  currency: string;
  health: HealthScore;
  insights: DashboardInsights;
  demo?: boolean;
}) {
  const ind = summary.indicators;
  const donutData: DonutDatum[] = (Object.entries(ind.expenseByNature) as [ExpenseNature, number][])
    .filter(([, v]) => v > 0)
    .map(([nature, value]) => ({
      name: NATURE_LABEL[nature] ?? nature,
      value,
      color: NATURE_COLOR[nature] ?? "var(--muted-2)",
    }));

  const incomeW = ind.incomeMonthly + ind.expenseMonthly;
  const incomePct = incomeW > 0 ? (ind.incomeMonthly / incomeW) * 100 : 50;

  return (
    <div className="grid">
      <div className="page-title" style={{ fontSize: 26 }}>
        Hola, <span className="it">{name}</span>
      </div>

      {demo ? (
        <div className="auth-msg warn" style={{ margin: 0 }}>
          Modo demostración con datos de ejemplo. Conecta Supabase y captura tu base para ver tus
          cifras reales.
        </div>
      ) : null}

      {/* HERO */}
      <section className="dash-hero">
        {/* Flujo de caja */}
        <div className="card card-pad">
          <div className="label">Flujo de caja mensual</div>
          <div className="num-xl" style={{ fontSize: 46, marginTop: 8 }}>
            {formatMoney(ind.freeCashflow, currency)}
          </div>
          <span
            className={`delta ${ind.freeCashflow >= 0 ? "up" : "down"}`}
            style={{ marginTop: 12 }}
          >
            {ind.freeCashflow >= 0 ? "Disponible para tus metas" : "Estás gastando de más"}
          </span>
          <div
            style={{
              display: "flex",
              gap: 22,
              marginTop: 16,
              fontSize: 12.5,
              color: "var(--muted)",
              flexWrap: "wrap",
            }}
          >
            <div>
              Ingresos{" "}
              <strong style={{ color: "var(--pos)" }}>
                {formatMoney(ind.incomeMonthly, currency)}
              </strong>
            </div>
            <div>
              Gastos{" "}
              <strong style={{ color: "var(--ink-2)" }}>
                {formatMoney(ind.expenseMonthly, currency)}
              </strong>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              height: 12,
              borderRadius: 999,
              overflow: "hidden",
              gap: 2,
              marginTop: 14,
            }}
          >
            <span style={{ background: "var(--pos)", width: `${incomePct}%` }} title="Ingresos" />
            <span
              style={{ background: "var(--c-expense)", width: `${100 - incomePct}%` }}
              title="Gastos"
            />
          </div>
        </div>

        {/* Salud financiera */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="label">Salud financiera</div>
            <span className="chip live">En vivo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14 }}>
            <div className="ring-wrap">
              <svg width="120" height="120" viewBox="0 0 42 42">
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke="var(--chip)"
                  strokeWidth="4"
                />
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke="var(--pos)"
                  strokeWidth="4"
                  strokeLinecap={health.score >= 100 ? "butt" : "round"}
                  pathLength={100}
                  strokeDasharray={`${health.score} 100`}
                  strokeDashoffset="25"
                  transform="rotate(-90 21 21)"
                />
              </svg>
              <div className="ring-center">
                <div>
                  <div className="num-xl" style={{ fontSize: 40 }}>
                    {health.score}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--pos)",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {health.grade}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
              {health.bars.map((b) => (
                <div
                  key={b.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "92px 1fr 42px",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{b.label}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${b.ratio * 100}%`, background: b.color }}
                    />
                  </div>
                  <span className="muted tnum" style={{ fontSize: 11.5, textAlign: "right" }}>
                    {b.display}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section className="cols-4">
        <Kpi
          label="Ingresos mensuales"
          value={formatMoney(ind.incomeMonthly, currency)}
          icon="income"
          accent="var(--pos)"
        />
        <Kpi
          label="Gasto mensual"
          value={formatMoney(ind.expenseMonthly, currency)}
          icon="expense"
          accent="var(--c-expense)"
        />
        <KpiLink
          label="Activos invertidos"
          icon="invest"
          accent="var(--c-invest)"
          href="/patrimonio"
          hint="Configura tu patrimonio"
        />
        <KpiLink
          label="Patrimonio neto"
          icon="networth"
          accent="var(--c-networth)"
          href="/mi-rich-life"
          hint="Construye tu Rich Life"
        />
      </section>

      {/* Próxima acción + composición */}
      <section className="dash-split">
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title">Tu próxima mejor acción</div>
            <span
              className="chip"
              style={{
                background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))",
                color: "var(--ink-2)",
              }}
            >
              Ascend AI
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(140deg, var(--pos), var(--teal))",
                color: "white",
                flex: "none",
              }}
            >
              <Icon name="spark" filled width={0} />
            </span>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
              {insights.nextBestAction}
            </p>
          </div>

          <div style={{ marginTop: 16 }}>
            {insights.insights.map((i, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 11,
                  padding: "13px 0",
                  borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(140deg, var(--pos), var(--teal))",
                    color: "white",
                    flex: "none",
                  }}
                >
                  <Icon name="spark" filled width={0} />
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{i.h}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                    {i.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="card-title">Composición de gastos</div>
            <Link className="ghost-link" href="/mi-base-financiera">
              Detalle <Icon name="chev" width={2.2} />
            </Link>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            <DonutChart
              data={donutData}
              centerLabel={formatCompact(ind.expenseMonthly, currency)}
              centerSub="al mes"
            />
            <div
              style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}
            >
              {donutData.length === 0 ? (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Agrega gastos en tu Base Financiera.
                </span>
              ) : (
                donutData.slice(0, 5).map((d) => (
                  <div
                    key={d.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "10px 1fr auto",
                      gap: 9,
                      alignItems: "center",
                      fontSize: 12.5,
                    }}
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
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: "income" | "expense";
  accent: string;
}) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="row" style={{ gap: 8 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            display: "grid",
            placeItems: "center",
            background: "color-mix(in srgb, " + accent + " 16%, transparent)",
            color: accent,
          }}
        >
          <Icon name={icon} width={2} />
        </span>
        <span className="label">{label}</span>
      </div>
      <div className="num-xl" style={{ fontSize: 28, marginTop: 12 }}>
        {value}
      </div>
    </div>
  );
}

function KpiLink({
  label,
  icon,
  accent,
  href,
  hint,
}: {
  label: string;
  icon: "invest" | "networth";
  accent: string;
  href: string;
  hint: string;
}) {
  return (
    <Link className="card kpi" href={href} style={{ padding: "16px 18px", display: "block" }}>
      <div className="row" style={{ gap: 8 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            display: "grid",
            placeItems: "center",
            background: "color-mix(in srgb, " + accent + " 16%, transparent)",
            color: accent,
          }}
        >
          <Icon name={icon} width={2} />
        </span>
        <span className="label">{label}</span>
      </div>
      <div className="num-xl" style={{ fontSize: 28, marginTop: 12, color: "var(--muted-2)" }}>
        —
      </div>
      <div className="ghost-link" style={{ marginTop: 10 }}>
        {hint} <Icon name="chev" width={2.2} />
      </div>
    </Link>
  );
}
