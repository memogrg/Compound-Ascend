import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
import { EditWealthButton, WealthActions } from "./wealth-actions";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";

const SEMAFORO: Record<string, string> = {
  rojo: "var(--neg)",
  amarillo: "var(--warn)",
  verde: "var(--pos)",
};

export function GrowthView({ summary }: { summary: WealthSummary }) {
  const { readiness, balance, portfolio, investments, prices, currency } = summary;
  const ring = SEMAFORO[readiness.semaforo] ?? "var(--warn)";

  const donut: DonutDatum[] = portfolio.distribution.map((d) => ({
    name: d.label,
    value: d.value,
    color: d.color,
  }));

  return (
    <div className="grid">
      {/* Estado patrimonial */}
      <section className="dash-hero">
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div className="ring-wrap">
            <svg width="120" height="120" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.915" fill="none" stroke={ring} strokeWidth="4" strokeLinecap={readiness.score >= 100 ? "butt" : "round"} pathLength={100} strokeDasharray={`${readiness.score} 100`} strokeDashoffset="25" transform="rotate(-90 21 21)" />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 36 }}>
                  {readiness.score}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>preparación</div>
              </div>
            </div>
          </div>
          <div>
            <div className="label">Preparación para invertir</div>
            <div className="chip" style={{ marginTop: 8, background: "color-mix(in srgb," + ring + " 16%, transparent)", color: ring }}>
              ● {readiness.stateLabel}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {readiness.message}
            </p>
          </div>
        </div>

        {/* Balance ofensiva / defensiva */}
        <div className="card card-pad">
          <div className="card-title">Balance patrimonial</div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <BalanceBar label="Ofensiva (crecimiento)" value={balance.offense} color="var(--c-invest)" />
            <BalanceBar label="Defensiva (protección)" value={balance.defense} color="var(--c-protect)" />
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
            {balance.message}
          </p>
        </div>
      </section>

      {/* Próxima acción patrimonial */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="card-title">Tu próxima mejor acción patrimonial</div>
          <span className="chip" style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}>
            Ascend AI
          </span>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>
          {readiness.semaforo === "rojo"
            ? "Primero protege tu base: completa tu fondo de emergencia y controla la deuda cara antes de aumentar inversión."
            : readiness.state === "empezar_pequeno"
              ? "Inicia una inversión mensual pequeña y automatizada, alineada a tu perfil de riesgo."
              : portfolio.diversification === "baja"
                ? "Aumenta la diversificación de tu portafolio antes de incrementar el aporte."
                : "Mantén tus aportes y revisa eficiencia de costos y rebalanceo."}
        </p>
      </div>

      {/* Cartera */}
      <section className="split-2-3">
        <div className="card card-pad">
          <div className="card-title">Distribución del portafolio</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
            <DonutChart data={donut} centerLabel={formatCompact(portfolio.totalInvested, currency)} centerSub="invertido" />
            <div style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 8 }}>
              {donut.length === 0 ? (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Agrega inversiones para ver su distribución.
                </span>
              ) : (
                donut.map((d) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 9, alignItems: "center", fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ color: "var(--ink-2)" }}>{d.name}</span>
                    <span className="muted tnum">{formatMoney(d.value, currency)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
            <div>
              Aporte mensual <strong style={{ color: "var(--ink-2)" }}>{formatMoney(portfolio.monthlyContribution, currency)}</strong>
            </div>
            <div>
              Diversificación <strong style={{ color: "var(--ink-2)", textTransform: "capitalize" }}>{portfolio.diversification}</strong>
            </div>
            <div>
              Concentración máx. <strong style={{ color: "var(--ink-2)" }}>{formatPercent(portfolio.topConcentration)}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Mis inversiones</div>
              <div className="card-sub">{investments.length} activo(s)</div>
            </div>
          </div>
          {investments.length === 0 ? (
            <div className="muted" style={{ padding: "20px 24px", fontSize: 13, display: "grid", gap: 12, justifyItems: "start" }}>
              <span>Aún no registras inversiones.</span>
              <WealthActions mode="investment" currency={currency} />
            </div>
          ) : (
            investments.map((inv) => {
              const live = inv.symbol ? prices[inv.symbol] : undefined;
              return (
                <div key={inv.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{inv.name}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {formatMoney(inv.investedAmount, currency)}
                      {live ? ` · precio: ${formatMoney(live.price, live.currency)}` : ""}
                    </div>
                  </div>
                  <span className="chip" style={{ textTransform: "uppercase", fontSize: 10.5 }}>
                    {inv.symbol ?? inv.assetType}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <EditWealthButton mode="investment" item={inv} currency={currency} />
                    <DeleteButton id={inv.id} kind="investment" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Checklist de preparación */}
      <div className="card card-pad">
        <div className="card-title">Tu preparación paso a paso</div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {readiness.checklist.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span style={{ color: c.met ? "var(--pos)" : "var(--muted-2)", flex: "none" }}>
                <Icon name={c.met ? "check" : "x"} width={2.4} />
              </span>
              <span style={{ color: c.met ? "var(--ink-2)" : "var(--muted)" }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BalanceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 40px", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="muted tnum" style={{ fontSize: 12, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
