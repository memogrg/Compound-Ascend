import Link from "next/link";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { EXPENSE_NATURES, NATURE_COLOR } from "@/modules/financial-base/constants";
import type { BaseSummary, HealthScore, ExpenseNature } from "@/modules/financial-base";
import type { DashboardInsights } from "@/modules/dashboard/engine/insights";
import type { PanelVM, NorteVM, PillarVM } from "@/modules/dashboard/engine/pillars";

const NATURE_LABEL = Object.fromEntries(EXPENSE_NATURES.map((n) => [n.value, n.label]));

export function DashboardView({
  name,
  summary,
  currency,
  health,
  insights,
  panel,
  demo = false,
}: {
  name: string;
  summary: BaseSummary;
  currency: string;
  health: HealthScore;
  insights: DashboardInsights;
  panel: PanelVM;
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

      {/* ① NORTE: ¿más rico o más pobre? + libertad + próxima mejor decisión */}
      <NorteBand norte={panel.norte} currency={currency} />

      {/* ② Los 4 pilares (cada uno con su lectura Ascend AI) */}
      <section className="dash-pillars">
        {panel.pillars.map((p) => (
          <PillarCard key={p.key} pillar={p} />
        ))}
      </section>

      {/* ③ Salud financiera + Composición de gastos (reusados) */}
      <section className="dash-split">
        <HealthCard health={health} />
        <CompositionCard
          donutData={donutData}
          expenseMonthly={ind.expenseMonthly}
          currency={currency}
        />
      </section>

      {/* ④ Perspectivas de Ascend AI (reusadas) */}
      <PerspectivesCard insights={insights} />
    </div>
  );
}

function NorteBand({ norte, currency }: { norte: NorteVM; currency: string }) {
  const up = norte.trend === "mas_rico";
  const down = norte.trend === "mas_pobre";
  const color = up ? "var(--pos)" : down ? "var(--neg)" : "var(--muted)";
  const bg = up ? "var(--pos-soft)" : down ? "var(--neg-soft)" : "var(--chip)";

  return (
    <section className="dash-norte">
      <div className="norte-cell">
        <div className="label">Tendencia patrimonial</div>
        <span className="trend-pill" style={{ color, background: bg, marginTop: 10 }}>
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={down ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"} />
          </svg>
          {norte.trendLabel}
        </span>
        {norte.velocity != null ? (
          <div className="num-xl" style={{ fontSize: 28, marginTop: 14, color }}>
            {norte.velocity >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(norte.velocity), currency)}
          </div>
        ) : null}
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
          {norte.velocityText}
        </p>
      </div>

      <div className="norte-cell">
        <div className="label">Libertad financiera</div>
        <div className="num-xl" style={{ fontSize: 28, marginTop: 12 }}>
          {formatPercent(norte.freedomPct)}
        </div>
        <div className="freedom-bar">
          <div
            className="freedom-fill"
            style={{ width: `${Math.min(norte.freedomPct * 100, 100)}%` }}
          />
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 9, lineHeight: 1.5 }}>
          {norte.freedomText}
        </p>
      </div>

      <div className="norte-cell norte-nba">
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <span className="nba-spark">
            <Icon name="spark" filled width={0} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Tu próxima mejor decisión</div>
            <div className="muted" style={{ fontSize: 11 }}>
              Ascend AI · prioridad #1
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
          {norte.nextBestAction}
        </p>
      </div>
    </section>
  );
}

function PillarCard({ pillar: p }: { pillar: PillarVM }) {
  return (
    <Link href={p.href} className="card pillar">
      <div className="row" style={{ gap: 9 }}>
        <span className="pillar-ic" style={{ background: p.soft, color: p.accent }}>
          <Icon name={p.icon} width={2} />
        </span>
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 500 }}>
          {p.label}
        </span>
      </div>
      <div className="num-xl" style={{ fontSize: 26, marginTop: 12 }}>
        {p.value}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 7 }}>
        {p.meta}
      </div>
      <div className="bar-track" style={{ marginTop: 12 }}>
        <div className="bar-fill" style={{ width: `${p.ratio * 100}%`, background: p.barColor }} />
      </div>
      <div className="ai-read">
        <span className="ai-dot">
          <Icon name="spark" filled width={0} />
        </span>
        <p>{p.ai}</p>
      </div>
    </Link>
  );
}

function HealthCard({ health }: { health: HealthScore }) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="label">Salud financiera</div>
        <span className="chip live">En vivo</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14 }}>
        <div className="ring-wrap">
          <svg width="120" height="120" viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
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
                <div className="bar-fill" style={{ width: `${b.ratio * 100}%`, background: b.color }} />
              </div>
              <span className="muted tnum" style={{ fontSize: 11.5, textAlign: "right" }}>
                {b.display}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompositionCard({
  donutData,
  expenseMonthly,
  currency,
}: {
  donutData: DonutDatum[];
  expenseMonthly: number;
  currency: string;
}) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="card-title">Composición de gastos</div>
        <Link className="ghost-link" href="/mi-base-financiera">
          Detalle <Icon name="chev" width={2.2} />
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
        <DonutChart
          data={donutData}
          centerLabel={formatCompact(expenseMonthly, currency)}
          centerSub="al mes"
        />
        <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}>
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
  );
}

function PerspectivesCard({ insights }: { insights: DashboardInsights }) {
  if (insights.insights.length === 0) return null;
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="card-title">Perspectivas de Ascend AI</div>
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
  );
}
