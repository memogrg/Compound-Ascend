import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
import { EditWealthButton } from "./wealth-actions";
import { AddHoldingButton, AddPurchaseButton, EditHoldingButton } from "./add-holding-wizard";
import { HoldingDetailButton } from "./holding-detail-modal";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type { AssetType, Holding } from "@/modules/wealth/types";

const SEMAFORO: Record<string, string> = {
  rojo: "var(--neg)",
  amarillo: "var(--warn)",
  verde: "var(--pos)",
};

// Part C: bucket mapping for category view
type Bucket = "ETF" | "Acción" | "Cripto" | "Renta fija" | "Inmueble" | "Negocio" | "Otros";

function getBucket(assetType: AssetType): Bucket {
  switch (assetType) {
    case "etf": return "ETF";
    case "accion": return "Acción";
    case "cripto": return "Cripto";
    case "bono":
    case "fondo":
    case "certificado":
    case "pension": return "Renta fija";
    case "inmueble": return "Inmueble";
    case "negocio": return "Negocio";
    default: return "Otros";
  }
}

export function GrowthView({ summary }: { summary: WealthSummary }) {
  const { readiness, balance, portfolio, investments, holdings, prices, currency } = summary;
  const ring = SEMAFORO[readiness.semaforo] ?? "var(--warn)";

  const donut: DonutDatum[] = portfolio.distribution.map((d) => ({
    name: d.label,
    value: d.value,
    color: d.color,
  }));

  // Part C: category breakdown
  const buckets = new Map<Bucket, { value: number; cost: number; count: number }>();
  for (const h of holdings) {
    const liveH = prices[h.symbol];
    const val = liveH ? h.quantity * liveH.price : h.quantity * h.averageCost;
    const cost = h.quantity * h.averageCost;
    const bucket = getBucket(h.assetType);
    const prev = buckets.get(bucket) ?? { value: 0, cost: 0, count: 0 };
    buckets.set(bucket, { value: prev.value + val, cost: prev.cost + cost, count: prev.count + 1 });
  }

  return (
    <div className="grid">
      {/* Estado patrimonial */}
      <section className="dash-hero">
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div className="ring-wrap">
            <svg width="120" height="120" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.915" fill="none" stroke={ring} strokeWidth="4"
                strokeLinecap={readiness.score >= 100 ? "butt" : "round"}
                pathLength={100} strokeDasharray={`${readiness.score} 100`}
                strokeDashoffset="25" transform="rotate(-90 21 21)" />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 36 }}>{readiness.score}</div>
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

      {/* Próxima acción */}
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
                <span className="muted" style={{ fontSize: 12.5 }}>Agrega inversiones para ver su distribución.</span>
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
            <div>Aporte mensual <strong style={{ color: "var(--ink-2)" }}>{formatMoney(portfolio.monthlyContribution, currency)}</strong></div>
            <div>Diversificación <strong style={{ color: "var(--ink-2)", textTransform: "capitalize" }}>{portfolio.diversification}</strong></div>
            <div>Concentración máx. <strong style={{ color: "var(--ink-2)" }}>{formatPercent(portfolio.topConcentration)}</strong></div>
          </div>

          {/* Part C: category summary */}
          {buckets.size > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="fld-label" style={{ marginBottom: 8 }}>Por categoría</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...buckets.entries()].map(([bucket, data]) => {
                  const roi = data.cost > 0 ? (data.value - data.cost) / data.cost : 0;
                  const pos = roi >= 0;
                  return (
                    <div key={bucket} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{bucket}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span className="muted">{data.count} posición(es)</span>
                        <span className="tnum" style={{ color: "var(--ink-2)" }}>{formatMoney(data.value, currency)}</span>
                        <span style={{ color: pos ? "var(--pos)" : "var(--neg)", fontWeight: 500, minWidth: 44, textAlign: "right" }}>
                          {pos ? "+" : ""}{formatPercent(roi)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Mis inversiones</div>
              <div className="card-sub">{holdings.length + investments.length} activo(s)</div>
            </div>
            {(holdings.length > 0 || investments.length > 0) && (
              <AddHoldingButton currency={currency} deepLinkKey="holding" />
            )}
          </div>

          {holdings.length === 0 && investments.length === 0 ? (
            <div className="muted" style={{ padding: "20px 24px", fontSize: 13, display: "grid", gap: 12, justifyItems: "start" }}>
              <span>Aún no registras inversiones.</span>
              <AddHoldingButton currency={currency} deepLinkKey="holding" />
            </div>
          ) : (
            <>
              {holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} prices={prices} currency={currency} />
              ))}
              {investments.map((inv) => {
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
              })}
            </>
          )}
        </div>
      </section>

      {/* Checklist */}
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

// ── Holding row (B1 ROI + A2 edit/delete + B2 detail) ────────────

function HoldingRow({
  holding,
  prices,
  currency,
}: {
  holding: Holding;
  prices: Record<string, { price: number; currency: string }>;
  currency: string;
}) {
  const liveH = prices[holding.symbol];
  const currentPrice = liveH?.price ?? null;
  const currentValue = currentPrice !== null ? holding.quantity * currentPrice : null;
  const costBasis = holding.quantity * holding.averageCost;
  const profitLoss = currentValue !== null ? currentValue - costBasis : null;
  const returnPct = profitLoss !== null && costBasis > 0 ? profitLoss / costBasis : null;
  const positive = (returnPct ?? 0) >= 0;

  return (
    <div className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>
          {holding.label ?? holding.symbol}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>{holding.symbol}</span>
          <span>·</span>
          <span>{holding.quantity.toFixed(holding.quantity < 1 ? 6 : 4)} uds.</span>
          {currentValue !== null ? (
            <span>{formatMoney(currentValue, liveH?.currency ?? holding.currency)}</span>
          ) : (
            <span>costo {formatMoney(costBasis, holding.currency)}</span>
          )}
          {/* B1: ROI% */}
          {returnPct !== null && (
            <span
              style={{
                color: positive ? "var(--pos)" : "var(--neg)",
                fontWeight: 500,
                fontSize: 11.5,
              }}
            >
              {positive ? "+" : ""}{formatPercent(returnPct)}
            </span>
          )}
          {/* B1: avg cost */}
          <span>@ {formatMoney(holding.averageCost, holding.currency)}</span>
        </div>
      </div>
      <span className="chip" style={{ textTransform: "uppercase", fontSize: 10.5 }}>
        {holding.assetType}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <HoldingDetailButton holding={holding} currentPrice={currentPrice} currency={currency} />
        <AddPurchaseButton holding={holding} currency={currency} />
        <EditHoldingButton holding={holding} currency={currency} />
        <DeleteButton id={holding.id} kind="holding" />
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
      <span className="muted tnum" style={{ fontSize: 12, textAlign: "right" }}>{value}</span>
    </div>
  );
}
