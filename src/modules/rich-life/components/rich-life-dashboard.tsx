import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { DeleteButton } from "./delete-button";
import { EditRichButton, AddRichButton } from "./rich-actions";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import type { RichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import type { RichTrend, Asset, Liability } from "@/modules/rich-life/types";

const TREND: Record<RichTrend, { label: string; cls: string; delta: string }> = {
  mas_rico: { label: "Te estás haciendo más rico", cls: "var(--pos)", delta: "up" },
  estable: { label: "Patrimonio estable", cls: "var(--muted)", delta: "flat" },
  mas_pobre: { label: "Te estás haciendo más pobre", cls: "var(--neg)", delta: "down" },
  sin_historico: { label: "Tu punto de partida", cls: "var(--muted)", delta: "flat" },
};

export function RichLifeDashboard({ summary }: { summary: RichLifeSummary }) {
  const { snapshot: s, assets, liabilities, currency } = summary;
  const ind = s.indicators;
  const trend = TREND[ind.trend];

  const assetDonut: DonutDatum[] = s.assetsByClass.map((a) => ({ name: a.label, value: a.value, color: a.color }));
  const liabDonut: DonutDatum[] = s.liabilitiesByClass.map((a) => ({ name: a.label, value: a.value, color: a.color }));
  const freedomPct = Math.min(100, Math.round(ind.financialFreedomIndex * 100));

  return (
    <div className="grid">
      {/* Hero: patrimonio neto + Rich Life Score */}
      <section className="dash-hero">
        <div className="card card-pad">
          <div className="label">Patrimonio neto</div>
          <div className="num-xl" style={{ fontSize: 46, marginTop: 8 }}>
            {formatMoney(ind.netWorth, currency)}
          </div>
          <span className={`delta ${trend.delta}`} style={{ marginTop: 12, color: trend.cls }}>
            {trend.label}
            {ind.wealthVelocity !== null ? ` · ${formatMoney(ind.wealthVelocity, currency)}/mes` : ""}
          </span>
          <div style={{ display: "flex", gap: 22, marginTop: 16, fontSize: 12.5, color: "var(--muted)", flexWrap: "wrap" }}>
            <div>
              Activos <strong style={{ color: "var(--pos)" }}>{formatMoney(ind.totalAssets, currency)}</strong>
            </div>
            <div>
              Pasivos <strong style={{ color: "var(--ink-2)" }}>{formatMoney(ind.totalLiabilities, currency)}</strong>
            </div>
            <div>
              Activos/Pasivos{" "}
              <strong style={{ color: "var(--ink-2)" }}>
                {ind.assetLiabilityRatio === Infinity ? "∞" : ind.assetLiabilityRatio}
              </strong>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div className="ring-wrap">
            <svg width="120" height="120" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--gold)" strokeWidth="4" strokeLinecap={s.score.score >= 100 ? "butt" : "round"} pathLength={100} strokeDasharray={`${s.score.score} 100`} strokeDashoffset="25" transform="rotate(-90 21 21)" />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 36 }}>
                  {s.score.score}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Rich Life</div>
              </div>
            </div>
          </div>
          <div>
            <div className="label">Rich Life Score</div>
            <div className="chip" style={{ marginTop: 8, background: "color-mix(in srgb,var(--gold) 18%, transparent)", color: "var(--gold)" }}>
              {s.score.state}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {s.reading}
            </p>
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <section className="cols-4">
        <Ind label="Activos productivos" value={formatPercent(ind.productiveAssetsPct)} note="trabajan para ti" />
        <Ind label="Activos líquidos" value={formatPercent(ind.liquidAssetsPct)} note="disponibles" />
        <Ind label="Meses de independencia" value={String(ind.monthsOfIndependence)} note="sin nuevos ingresos" />
        <Ind label="Endeudamiento patrimonial" value={formatPercent(ind.debtToAssets)} note="pasivos / activos" />
      </section>

      {/* Donuts activos / pasivos */}
      <section className="cols-2">
        <DonutCard title="Composición de activos" data={assetDonut} total={ind.totalAssets} currency={currency} empty="Agrega tus activos." />
        <DonutCard title="Composición de pasivos" data={liabDonut} total={ind.totalLiabilities} currency={currency} empty="Sin pasivos registrados." />
      </section>

      {/* Termómetro de libertad financiera */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="card-title">Libertad financiera</div>
          <span className="muted" style={{ fontSize: 12 }}>
            Ingresos pasivos cubren {freedomPct}% de tus gastos
          </span>
        </div>
        <div className="bar-track" style={{ marginTop: 14, height: 12 }}>
          <div className="bar-fill" style={{ width: `${freedomPct}%`, background: "linear-gradient(90deg, var(--pos), var(--teal))" }} />
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Meta: 100% = tus ingresos pasivos cubren todos tus gastos (independencia financiera).
        </div>
      </div>

      {/* Próxima mejor acción */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="card-title">Tu próxima mejor acción</div>
          <span className="chip" style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}>
            Rich Life Snapshot
          </span>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>{s.nextBestAction}</p>
      </div>

      {/* Listas */}
      <section className="dash-split">
        <ListCard
          title="Mis activos"
          sub={`${assets.length} registrado(s)`}
          currency={currency}
          addKind="asset"
          items={assets.map((a) => ({ id: a.id, name: a.name, sub: a.assetClass.replace("_", " "), amount: formatMoney(a.value, a.currency), color: "var(--pos)", kind: "asset" as const, entity: a }))}
          emptyText="Agrega tu casa, carro, inversiones…"
        />
        <ListCard
          title="Mis pasivos"
          sub={`${liabilities.length} registrado(s)`}
          currency={currency}
          addKind="liability"
          items={liabilities.map((l) => ({ id: l.id, name: l.name, sub: l.liabilityClass, amount: formatMoney(l.balance, l.currency), color: "var(--neg)", kind: "liability" as const, entity: l }))}
          emptyText="Agrega hipotecas u otras deudas grandes."
        />
      </section>
    </div>
  );
}

function Ind({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="label">{label}</div>
      <div className="num-xl" style={{ fontSize: 26, marginTop: 10 }}>
        {value}
      </div>
      <div className="muted fs12" style={{ marginTop: 8 }}>
        {note}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  data,
  total,
  currency,
  empty,
}: {
  title: string;
  data: DonutDatum[];
  total: number;
  currency: string;
  empty: string;
}) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
        <DonutChart data={data} centerLabel={formatCompact(total, currency)} />
        <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}>
          {data.length === 0 ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {empty}
            </span>
          ) : (
            data.map((d) => (
              <div key={d.name} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 9, alignItems: "center", fontSize: 12.5 }}>
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

function ListCard({
  title,
  sub,
  items,
  emptyText,
  currency,
  addKind,
}: {
  title: string;
  sub: string;
  items: {
    id: string;
    name: string;
    sub: string;
    amount: string;
    color: string;
    kind: "asset" | "liability";
    entity: Asset | Liability;
  }[];
  emptyText: string;
  currency: string;
  addKind: "asset" | "liability";
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ padding: "20px 24px", fontSize: 13, display: "grid", gap: 12, justifyItems: "start" }}>
          <span>{emptyText}</span>
          <AddRichButton
            kind={addKind}
            currency={currency}
            variant={addKind === "asset" ? "btn-primary" : "btn-secondary"}
          />
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2, textTransform: "capitalize" }}>
                {it.sub}
              </div>
            </div>
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500, color: it.color }}>
              {it.amount}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <EditRichButton kind={it.kind} item={it.entity} currency={currency} />
              <DeleteButton id={it.id} kind={it.kind} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
