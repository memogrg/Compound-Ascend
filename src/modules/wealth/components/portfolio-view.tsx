"use client";

/**
 * Vista de cartera con 4 paneles (Resumen · Cartera · Dividendos · Rendimiento)
 * con el diseño Claude (Investments.html). Solo presentación: se alimenta del
 * reporte de portafolio y de los snapshots ya calculados por los servicios.
 * El panel Resumen integra la lectura de "preparación" existente.
 *
 * TODO(data) — datos que el backend aún no expone (placeholders abajo):
 *  - Sector real por holding → se agrupa por CLASE de activo (Opción A).
 *  - Dividendos: pagadores y calendario por holding (el reporte solo da agregados).
 *  - Rendimiento: benchmark (índice) y métricas de riesgo (volatilidad, etc.).
 */
import { useEffect, useMemo, useState } from "react";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { PerformanceChart, type AreaPoint } from "@/components/charts/area-chart";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { HoldingIcon, iconGradient } from "./holding-icon";
import { AddHoldingButton } from "./add-holding-wizard";
import { HoldingDetailModal } from "./holding-detail-modal";
import type { PortfolioReport } from "@/modules/wealth/services/portfolio-service";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type { AssetType, Dividend, HoldingPerformance, PortfolioSnapshot } from "@/modules/wealth/types";

/** Meses por frecuencia (para anualizar el dividendo configurado). */
const FREQ_MONTHS: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

type Tab = "resumen" | "cartera" | "dividendos" | "rendimiento";
type Period = "1M" | "3M" | "Año" | "1A" | "Todo";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cartera", label: "Cartera" },
  { id: "dividendos", label: "Dividendos" },
  { id: "rendimiento", label: "Rendimiento" },
];
const PERIODS: Period[] = ["1M", "3M", "Año", "1A", "Todo"];

const CLASS_LABEL: Record<AssetType, string> = {
  etf: "ETF", accion: "Acciones", bono: "Bonos", fondo: "Fondos",
  certificado: "Certificados", inmueble: "Inmuebles", cripto: "Cripto",
  negocio: "Negocios", pension: "Pensión", commodity: "Materias primas",
  arte: "Arte", nft: "NFT", otro: "Otros",
};

function periodCutoff(period: Period): string | null {
  if (period === "Todo") return null;
  const d = new Date();
  if (period === "Año") return `${d.getFullYear()}-01-01`;
  if (period === "1M") d.setMonth(d.getMonth() - 1);
  else if (period === "3M") d.setMonth(d.getMonth() - 3);
  else if (period === "1A") d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function PortfolioView({
  report,
  snapshots,
  dividends,
  summary,
}: {
  report: PortfolioReport;
  snapshots: PortfolioSnapshot[];
  dividends: Dividend[];
  summary: WealthSummary;
}) {
  const { analytics, dividendAnalytics, currency } = report;
  const [tab, setTab] = useState<Tab>("resumen");
  const [period, setPeriod] = useState<Period>("Año");

  // Sincroniza con el hash (deep-link, mismo patrón que Presupuesto).
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      if (TABS.some((t) => t.id === h)) setTab(h as Tab);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    try { history.replaceState(null, "", `#${t}`); } catch { /* noop */ }
  };

  const holds = useMemo(
    () => [...analytics.holdingsWithPerformance].sort((a, b) => b.currentValue - a.currentValue),
    [analytics.holdingsWithPerformance],
  );
  const total = analytics.totalPortfolioValue;

  // Serie del gráfico de crecimiento (snapshots filtrados por periodo).
  const series: AreaPoint[] = useMemo(() => {
    const cutoff = periodCutoff(period);
    const pts = snapshots
      .filter((s) => !cutoff || s.date >= cutoff)
      .map((s) => ({ date: s.date, value: s.portfolioValue }));
    if (pts.length >= 2) return pts;
    // Pocos puntos: línea mínima coste→valor actual.
    if (analytics.totalCostBasis > 0 && total > 0) {
      return [
        { date: "Inicio", value: Math.round(analytics.totalCostBasis) },
        { date: "Hoy", value: Math.round(total) },
      ];
    }
    return pts;
  }, [snapshots, period, analytics.totalCostBasis, total]);

  const gainPositive = analytics.totalProfitLoss >= 0;

  return (
    <div className="grid">
      {/* Tabs + periodo */}
      <div className="row" style={{ justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div className="base-tabs" role="tablist" aria-label="Secciones de cartera" style={{ border: 0 }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={tab === t.id ? "base-tab active" : "base-tab"} onClick={() => selectTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p} type="button" className={period === p ? "seg-btn on" : "seg-btn"} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" ? (
        <ResumenPanel report={report} series={series} gainPositive={gainPositive} summary={summary} />
      ) : tab === "cartera" ? (
        <CarteraPanel report={report} holds={holds} total={total} summary={summary} />
      ) : tab === "dividendos" ? (
        <DividendosPanel currency={currency} div={dividendAnalytics} holds={holds} dividends={dividends} />
      ) : (
        <RendimientoPanel report={report} snapshots={snapshots} period={period} holds={holds} />
      )}
    </div>
  );
}

// ============================== RESUMEN ==============================
function ResumenPanel({
  report, series, gainPositive, summary,
}: {
  report: PortfolioReport; series: AreaPoint[]; gainPositive: boolean; summary: WealthSummary;
}) {
  const { analytics, dividendAnalytics, currency } = report;
  const total = analytics.totalPortfolioValue;
  const slices = Object.values(analytics.allocation).filter((a) => a.value > 0);
  const donut: DonutDatum[] = slices.map((a) => ({ name: a.label, value: a.value, color: a.color }));

  return (
    <>
      <section className="perf-grid">
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div className="label">Valor de la cartera</div>
              <div className="num-xl perf-amt" style={{ marginTop: 8 }}>{formatMoney(total, currency)}</div>
              <span className={gainPositive ? "delta up" : "delta down"} style={{ marginTop: 12 }}>
                {gainPositive ? "+" : ""}{formatMoney(analytics.totalProfitLoss, currency)} · {formatPercent(analytics.totalReturnPct)} total
              </span>
            </div>
            <span className="chip live">Mercados abiertos</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <PerformanceChart data={series} currency={currency} height={210} tone={gainPositive ? "pos" : "neg"} />
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title">Distribución de activos</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>Por clase de activo</div>
          <div className="alloc-mini">
            <DonutChart data={donut} centerLabel={formatCompact(total, currency)} centerSub="invertido" />
            <div style={{ flex: 1, minWidth: 150 }}>
              {donut.length === 0 ? (
                <span className="muted" style={{ fontSize: 12.5 }}>Agrega posiciones para ver su distribución.</span>
              ) : (
                slices.map((a) => (
                  <div key={a.label} className="al-row">
                    <span className="sw" style={{ background: a.color }} />
                    <span className="nm">{a.label}</span>
                    <span className="pc">{formatPercent(a.pct)}</span>
                    <span className="am">{formatMoney(a.value, currency)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stat-strip">
        <div className="card stat">
          <div className="ttl">Retorno total</div>
          <div className="val" style={{ color: gainPositive ? "var(--pos)" : "var(--neg)" }}>
            {gainPositive ? "+" : ""}{formatMoney(analytics.totalProfitLoss, currency)}
          </div>
          <div className={gainPositive ? "delta up" : "delta down"} style={{ marginTop: 8, padding: "2px 7px" }}>{formatPercent(analytics.totalReturnPct)}</div>
        </div>
        <div className="card stat">
          <div className="ttl">Dividendos anuales</div>
          <div className="val">{formatMoney(dividendAnalytics.annualDividends, currency)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>{formatPercent(dividendAnalytics.dividendYield)} rentabilidad</div>
        </div>
        <div className="card stat">
          <div className="ttl">Ingreso pasivo</div>
          <div className="val" style={{ color: "var(--pos)" }}>{formatMoney(dividendAnalytics.monthlyDividends, currency)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>/mes · dividendos</div>
        </div>
        <div className="card stat">
          <div className="ttl">Coste base</div>
          <div className="val">{formatMoney(analytics.totalCostBasis, currency)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>ganancia no realizada</div>
        </div>
      </section>

      {/* Principales posiciones */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Principales posiciones</div>
            <div className="card-sub">{analytics.holdingsWithPerformance.length} posición(es) · precios en vivo</div>
          </div>
          <AddHoldingButton currency={currency} />
        </div>
        {analytics.holdingsWithPerformance.length === 0 ? (
          <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>Aún no registras posiciones.</div>
        ) : (
          [...analytics.holdingsWithPerformance]
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, 6)
            .map((h) => <HoldRow key={h.id} h={h} total={total} currency={currency} />)
        )}
      </div>

      {/* Preparación (integrada) */}
      <ReadinessBlock summary={summary} />
    </>
  );
}

// ============================== CARTERA ==============================
function CarteraPanel({
  report, holds, total, summary,
}: {
  report: PortfolioReport; holds: HoldingPerformance[]; total: number; summary: WealthSummary;
}) {
  const { currency } = report;
  const dcaInvestmentIds = new Set(summary.investments.filter((i) => i.contribution > 0).map((i) => i.id));
  const dcaPlans = summary.investments.filter((i) => i.contribution > 0);

  // Por cuenta (broker).
  const byAccount = groupSum(holds, (h) => h.broker?.trim() || "Sin cuenta");
  // Por clase de activo (Opción A — no hay sector real).
  const byClass = groupSum(holds, (h) => CLASS_LABEL[h.assetType] ?? "Otros");
  const classColors = ["var(--info)", "var(--pos)", "var(--warn)", "var(--teal)", "var(--c-networth)", "var(--gold)", "var(--muted-2)"];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div><div className="card-title">Por cuenta</div><div className="card-sub">Agrupado por broker / cuenta</div></div>
          <AddHoldingButton currency={currency} />
        </div>
        {byAccount.length === 0 ? (
          <Empty />
        ) : (
          byAccount.map((g, i) => (
            <div key={g.key} className="acct-row2">
              <div className="hold-ic" style={{ background: classColors[i % classColors.length], fontSize: 13 }}>
                {g.key.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="hold-name">{g.key}</div>
                <div className="hold-sub">{g.count} posición(es)</div>
              </div>
              <div className="hold-val">
                <div className="v">{formatMoney(g.value, currency)}</div>
                <div className="d muted">{total > 0 ? formatPercent(g.value / total) : "—"} del total</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Por clase de activo</div>
            <div className="card-sub">Exposición por tipo (sector real no disponible)</div>
          </div>
        </div>
        {byClass.length === 0 ? (
          <Empty />
        ) : (
          byClass.map((g, i) => (
            <div key={g.key} className="sec-row">
              <span className="sw" style={{ background: classColors[i % classColors.length] }} />
              <span className="nm" style={{ color: "var(--ink-2)" }}>{g.key}</span>
              <span className="pc">{total > 0 ? formatPercent(g.value / total) : "—"}</span>
              <span className="am">{formatMoney(g.value, currency)}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div><div className="card-title">Todas las posiciones</div><div className="card-sub">{holds.length} posición(es) · ordenadas por valor</div></div>
          <AddHoldingButton currency={currency} />
        </div>
        {holds.length === 0 ? (
          <Empty />
        ) : (
          holds.map((h) => (
            <HoldRow key={h.id} h={h} total={total} currency={currency} dca={h.investmentId ? dcaInvestmentIds.has(h.investmentId) : false} />
          ))
        )}
      </div>

      {/* DCAs en proceso (no está en el diseño; coherente con el estilo) */}
      <div className="card">
        <div className="card-head">
          <div><div className="card-title">DCAs en proceso</div><div className="card-sub">Aportes recurrentes activos (informativo, no ejecuta órdenes)</div></div>
        </div>
        {dcaPlans.length === 0 ? (
          <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
            No tienes planes de aporte recurrente. Crea uno con “Añadir posición” → modo DCA.
          </div>
        ) : (
          dcaPlans.map((p) => (
            <div key={p.id} className="acct-row2">
              <div className="hold-ic" style={iconGradient(p.assetType, p.symbol ?? undefined)}>
                {(p.symbol ?? p.name).slice(0, 4).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="hold-name">{p.name}</div>
                <div className="hold-sub" style={{ textTransform: "capitalize" }}>{p.horizon ?? "recurrente"} · aporte recurrente</div>
              </div>
              <div className="hold-val">
                <div className="v">{formatMoney(p.contribution, p.currency)}</div>
                <div className="d muted">próx. aporte ~{p.horizon ?? "—"}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ============================== DIVIDENDOS ==============================
const MONTHS_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function DividendosPanel({
  currency, div, holds, dividends,
}: {
  currency: string;
  div: PortfolioReport["dividendAnalytics"];
  holds: HoldingPerformance[];
  dividends: Dividend[];
}) {
  // Solo dividendos reales (monto > 0 o rentabilidad > 0).
  const paid = dividends.filter((d) => d.amount > 0 || (d.yieldPct ?? 0) > 0);
  const holdById = new Map(holds.map((h) => [h.id, h]));

  // Pagadores: agrega por holding usando el registro MÁS reciente (run-rate anual).
  const payers = useMemo(() => {
    const byHolding = new Map<string, { latest: Dividend; annual: number }>();
    // `dividends` viene ordenado desc por fecha → el primero por holding es el último pago.
    for (const d of paid) {
      if (byHolding.has(d.holdingId)) continue;
      const factor = 12 / (FREQ_MONTHS[d.frequency ?? "anual"] ?? 12);
      byHolding.set(d.holdingId, { latest: d, annual: d.amount * factor });
    }
    return [...byHolding.entries()]
      .map(([holdingId, v]) => ({ holdingId, ...v }))
      .sort((a, b) => b.annual - a.annual);
  }, [paid]);

  // Estado vacío: no hay ningún dividendo configurado/registrado.
  if (paid.length === 0) {
    return (
      <div className="card card-pad" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        <div className="card-title">Sin dividendos registrados</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Aún no registras dividendos · marca el dividendo de una inversión para verlos aquí.
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="stat-strip">
        <div className="card stat"><div className="ttl">Dividendos anuales</div><div className="val">{formatMoney(div.annualDividends, currency)}</div></div>
        <div className="card stat"><div className="ttl">Mensual estimado</div><div className="val" style={{ color: "var(--pos)" }}>{formatMoney(div.monthlyDividends, currency)}</div></div>
        <div className="card stat"><div className="ttl">Rentabilidad media</div><div className="val">{formatPercent(div.dividendYield)}</div></div>
        <div className="card stat"><div className="ttl">Yield on cost</div><div className="val">{formatPercent(div.yieldOnCost)}</div></div>
      </section>

      <section className="mid-grid">
        {/* Calendario: solo pagos de holdings con dividendo configurado */}
        <div className="card">
          <div className="card-head"><div><div className="card-title">Calendario de dividendos</div><div className="card-sub">Pagos registrados</div></div></div>
          {paid.slice(0, 8).map((d) => {
            const h = holdById.get(d.holdingId);
            const [, mm, dd] = d.paymentDate.split("-");
            return (
              <div key={d.id} className="div-row">
                <div className="div-day">
                  <div className="d">{Number(dd ?? 1)}</div>
                  <div className="m">{MONTHS_ABBR[Number(mm ?? 1) - 1] ?? ""}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="hold-name">{h?.label ?? h?.symbol ?? "Dividendo"}</div>
                  <div className="hold-sub" style={{ textTransform: "capitalize" }}>{d.frequency ?? "pago"}</div>
                </div>
                <div className="hold-val"><div className="v" style={{ color: "var(--pos)" }}>+{formatMoney(d.amount, d.currency)}</div></div>
              </div>
            );
          })}
        </div>

        {/* Principales pagadores: solo holdings con dividendo > 0, por $/año */}
        <div className="card">
          <div className="card-head"><div><div className="card-title">Principales pagadores</div><div className="card-sub">{payers.length} con dividendo · por $/año</div></div></div>
          {payers.map((p) => {
            const h = holdById.get(p.holdingId);
            return (
              <div key={p.holdingId} className="hold-row" style={{ gridTemplateColumns: "38px 1fr auto" }}>
                {h ? <HoldingIcon assetType={h.assetType} symbol={h.symbol} label={h.label} /> : <div className="hold-ic" style={{ background: "var(--chip)", color: "var(--ink-2)" }}>—</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="hold-name">{h?.label ?? h?.symbol ?? "Dividendo"}</div>
                  <div className="hold-sub">{p.latest.yieldPct != null ? `${formatPercent(p.latest.yieldPct / 100)} rentab.` : (h?.symbol ?? "")}</div>
                </div>
                <div className="hold-val">
                  <div className="v" style={{ color: "var(--pos)" }}>{formatMoney(p.annual, p.latest.currency)}</div>
                  <div className="d muted">/año</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ============================== RENDIMIENTO ==============================
function RendimientoPanel({
  report, snapshots, period, holds,
}: {
  report: PortfolioReport; snapshots: PortfolioSnapshot[]; period: Period; holds: HoldingPerformance[];
}) {
  const { currency } = report;
  const cutoff = periodCutoff(period);
  const filtered = snapshots.filter((s) => !cutoff || s.date >= cutoff);
  const base = filtered[0]?.portfolioValue ?? 0;
  const cumSeries: AreaPoint[] = base > 0
    ? filtered.map((s) => ({ date: s.date, value: (s.portfolioValue / base - 1) * 100 }))
    : [];

  const byReturn = [...holds].sort((a, b) => b.returnPct - a.returnPct);
  const best = byReturn.slice(0, 3);
  const worst = byReturn.slice(-3).reverse();

  return (
    <>
      <div className="card card-pad">
        <div className="card-title">Retorno acumulado</div>
        <div className="card-sub" style={{ marginBottom: 8 }}>% sobre el inicio del periodo · benchmark no disponible</div>
        {/* TODO(data): no hay serie de benchmark (índice) para comparar. */}
        <PerformanceChart
          data={cumSeries}
          currency={currency}
          height={200}
          formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
          tone={(cumSeries[cumSeries.length - 1]?.value ?? 0) >= 0 ? "pos" : "neg"}
        />
      </div>

      <div className="card card-pad">
        <div className="card-title">Métricas de riesgo</div>
        {/* TODO(data): volatilidad, beta, Sharpe, máx. drawdown no se calculan aún. */}
        <div className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
          Las métricas de riesgo (volatilidad, beta, drawdown) aún no están disponibles.
        </div>
      </div>

      <section className="mid-grid">
        <div className="card">
          <div className="card-head"><div className="card-title">Mejores posiciones</div></div>
          {best.map((h) => <PerfRow key={h.id} h={h} currency={currency} />)}
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Peores posiciones</div></div>
          {worst.map((h) => <PerfRow key={h.id} h={h} currency={currency} />)}
        </div>
      </section>
    </>
  );
}

// ── Filas / bloques compartidos ────────────────────────────────────
function HoldRow({
  h, total, currency, dca,
}: {
  h: HoldingPerformance; total: number; currency: string; dca?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pct = total > 0 ? h.currentValue / total : 0;
  const pos = h.returnPct >= 0;
  const swColor = iconGradient(h.assetType, h.symbol).background.match(/var\([^)]+\)/)?.[0] ?? "var(--info)";
  return (
    <div className="hold-row" style={{ cursor: "pointer" }} role="button" tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => { if (e.key === "Enter") setOpen(true); }}>
      {open ? (
        <HoldingDetailModal holding={h} currentPrice={h.currentPrice ?? null} currency={currency} onClose={() => setOpen(false)} />
      ) : null}
      <HoldingIcon assetType={h.assetType} symbol={h.symbol} label={h.label} />
      <div style={{ minWidth: 0 }}>
        <div className="hold-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {h.label ?? h.symbol}
          {dca ? <span className="chip" style={{ fontSize: 9.5, padding: "1px 6px", background: "var(--info-soft)", color: "var(--info)" }}>DCA</span> : null}
        </div>
        <div className="hold-sub">{h.quantity.toFixed(h.quantity < 1 ? 6 : 2)} uds · coste {formatMoney(h.averageCost, currency)}</div>
      </div>
      <div className="hold-alloc alloc-cell">
        <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, pct * 100)}%`, background: swColor }} /></div>
        <div className="l">{formatPercent(pct)} · {h.broker?.trim() || "Sin cuenta"}</div>
      </div>
      <div className="hold-price price-cell">{h.currentPrice != null ? formatMoney(h.currentPrice, currency) : "—"}</div>
      <div className="hold-val">
        <div className="v">{formatMoney(h.currentValue, currency)}</div>
        <div className="d" style={{ color: pos ? "var(--pos)" : "var(--neg)" }}>{pos ? "+" : ""}{formatPercent(h.returnPct)}</div>
      </div>
    </div>
  );
}

function PerfRow({ h, currency }: { h: HoldingPerformance; currency: string }) {
  const pos = h.returnPct >= 0;
  return (
    <div className="hold-row" style={{ gridTemplateColumns: "38px 1fr auto" }}>
      <HoldingIcon assetType={h.assetType} symbol={h.symbol} label={h.label} />
      <div style={{ minWidth: 0 }}>
        <div className="hold-name">{h.label ?? h.symbol}</div>
        <div className="hold-sub">{formatMoney(h.currentValue, currency)}</div>
      </div>
      <div className="hold-val"><div className="v" style={{ color: pos ? "var(--pos)" : "var(--neg)" }}>{pos ? "+" : ""}{formatPercent(h.returnPct)}</div></div>
    </div>
  );
}

function ReadinessBlock({ summary }: { summary: WealthSummary }) {
  const { readiness, balance } = summary;
  const ring = readiness.semaforo === "verde" ? "var(--pos)" : readiness.semaforo === "rojo" ? "var(--neg)" : "var(--warn)";
  return (
    <section className="perf-grid">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="card-title">Tu próxima mejor acción</div>
          <span className="chip" style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}>Ascend AI</span>
        </div>
        <span className="chip" style={{ background: `color-mix(in srgb, ${ring} 16%, transparent)`, color: ring }}>● {readiness.stateLabel}</span>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 10 }}>{readiness.message}</p>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
          {readiness.checklist.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 12.5 }}>
              <span style={{ color: c.met ? "var(--pos)" : "var(--muted-2)", flex: "none" }}><Icon name={c.met ? "check" : "x"} width={2.4} /></span>
              <span style={{ color: c.met ? "var(--ink-2)" : "var(--muted)" }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card card-pad">
        <div className="card-title">Balance patrimonial</div>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bar label="Ofensiva (crecimiento)" value={balance.offense} color="var(--c-invest)" />
          <Bar label="Defensiva (protección)" value={balance.defense} color="var(--c-protect)" />
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>{balance.message}</p>
      </div>
    </section>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 40px", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${value}%`, background: color }} /></div>
      <span className="muted tnum" style={{ fontSize: 12, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Empty() {
  return <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>Aún no registras posiciones.</div>;
}

function groupSum(
  holds: HoldingPerformance[],
  keyFn: (h: HoldingPerformance) => string,
): { key: string; value: number; count: number }[] {
  const map = new Map<string, { value: number; count: number }>();
  for (const h of holds) {
    const k = keyFn(h);
    const prev = map.get(k) ?? { value: 0, count: 0 };
    map.set(k, { value: prev.value + h.currentValue, count: prev.count + 1 });
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value);
}
