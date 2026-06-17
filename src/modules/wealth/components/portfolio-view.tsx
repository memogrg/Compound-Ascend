"use client";

/**
 * Vista del Portafolio de inversiones (rediseño Fase 3). Subtabs arriba:
 * "Portafolio de inversiones" (esta fase), "Calculadora de Interés Compuesto" y
 * "Monitor de Fondos" (placeholders · Fase 4). El subtab Portafolio muestra KPIs
 * por taxonomía (filtro de periodo A), dos donas (naturaleza/categoría), la línea
 * de monto invertido, y una tabla (filtro de periodo B independiente) con menú
 * "…" que abre el detalle (retiro/editar/eliminar ya existentes). Conserva la
 * sección de Dividendos y la lectura de Preparación abajo.
 *
 * Solo presentación: se alimenta del reporte/snapshots ya calculados y del motor
 * puro (portfolio-engine). No cambia firmas de services.
 */
import { useMemo, useState } from "react";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { PerformanceChart, type AreaPoint } from "@/components/charts/lazy";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import {
  allocationByNature,
  allocationByCategory,
  periodReturn,
} from "@/modules/wealth/engine/portfolio-engine";
import { CATEGORY_META } from "@/modules/wealth/constants";
import { HoldingIcon } from "./holding-icon";
import { AddHoldingButton } from "./add-holding-wizard";
import { HoldingDetailModal } from "./holding-detail-modal";
import { CompoundCalculator } from "./compound-calculator";
import { FundMonitor } from "./fund-monitor";
import type { PortfolioReport } from "@/modules/wealth/services/portfolio-service";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type {
  Dividend,
  HoldingPerformance,
  PortfolioSnapshot,
  AllocationSlice,
} from "@/modules/wealth/types";

const FREQ_MONTHS: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Subtab = "portafolio" | "calculadora" | "monitor";
type Period = "1M" | "3M" | "YTD" | "Todo";
const PERIODS: Period[] = ["1M", "3M", "YTD", "Todo"];

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: "portafolio", label: "Portafolio de inversiones" },
  { id: "calculadora", label: "Calculadora de Interés Compuesto" },
  { id: "monitor", label: "Monitor de Fondos" },
];

function periodCutoff(period: Period): string | null {
  if (period === "Todo") return null;
  const d = new Date();
  if (period === "YTD") return `${d.getFullYear()}-01-01`;
  if (period === "1M") d.setMonth(d.getMonth() - 1);
  else if (period === "3M") d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// ── Componente raíz: subtabs ───────────────────────────────────────

export function PortfolioView({
  report,
  snapshots,
  dividends,
  summary,
  investmentRate,
}: {
  report: PortfolioReport;
  snapshots: PortfolioSnapshot[];
  dividends: Dividend[];
  summary: WealthSummary;
  /** Tasa de inversión (0-1) de BaseIndicators (financial-base). */
  investmentRate: number;
}) {
  const [subtab, setSubtab] = useState<Subtab>("portafolio");

  return (
    <div className="grid">
      <div className="seg" role="tablist" aria-label="Secciones de patrimonio" style={{ flexWrap: "wrap" }}>
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={subtab === t.id}
            className={subtab === t.id ? "seg-btn on" : "seg-btn"}
            onClick={() => setSubtab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subtab === "portafolio" ? (
        <PortfolioPanel
          report={report}
          snapshots={snapshots}
          dividends={dividends}
          summary={summary}
          investmentRate={investmentRate}
        />
      ) : subtab === "calculadora" ? (
        <CompoundCalculator
          defaultCapital={report.analytics.totalCostBasis}
          currency={report.currency}
        />
      ) : (
        <FundMonitor />
      )}
    </div>
  );
}

// ── Subtab Portafolio ──────────────────────────────────────────────

function PortfolioPanel({
  report,
  snapshots,
  dividends,
  summary,
  investmentRate,
}: {
  report: PortfolioReport;
  snapshots: PortfolioSnapshot[];
  dividends: Dividend[];
  summary: WealthSummary;
  investmentRate: number;
}) {
  const { analytics, dividendAnalytics, currency } = report;
  const holds = useMemo(
    () => [...analytics.holdingsWithPerformance].sort((a, b) => b.currentValue - a.currentValue),
    [analytics.holdingsWithPerformance],
  );

  // Filtros de periodo INDEPENDIENTES: A → indicadores; B → resumen sobre tabla.
  const [periodA, setPeriodA] = useState<Period>("Todo");
  const [periodB, setPeriodB] = useState<Period>("Todo");

  // Rendimiento del periodo A. NOTA: los aportes del periodo aún no se plumean a
  // la vista (sería un fetch extra de transacciones vinculadas); de momento es el
  // cambio de valor del periodo (contributions = 0). TODO: restar aportes.
  const retA = useMemo(() => {
    const cutoff = periodCutoff(periodA);
    const pts = snapshots
      .filter((s) => !cutoff || s.date >= cutoff)
      .map((s) => ({ date: s.date, portfolioValue: s.portfolioValue }));
    return periodReturn(pts, 0);
  }, [snapshots, periodA]);

  const retB = useMemo(() => {
    const cutoff = periodCutoff(periodB);
    const pts = snapshots
      .filter((s) => !cutoff || s.date >= cutoff)
      .map((s) => ({ date: s.date, portfolioValue: s.portfolioValue }));
    return periodReturn(pts, 0);
  }, [snapshots, periodB]);

  // Línea: monto invertido en el tiempo (snapshots filtrados por A).
  const investedSeries: AreaPoint[] = useMemo(() => {
    const cutoff = periodCutoff(periodA);
    const pts = snapshots
      .filter((s) => !cutoff || s.date >= cutoff)
      .map((s) => ({ date: s.date, value: s.investmentValue || s.portfolioValue }));
    if (pts.length >= 2) return pts;
    if (analytics.totalCostBasis > 0) {
      return [
        { date: "Inicio", value: Math.round(analytics.totalCostBasis) },
        { date: "Hoy", value: Math.round(analytics.totalPortfolioValue) },
      ];
    }
    return pts;
  }, [snapshots, periodA, analytics.totalCostBasis, analytics.totalPortfolioValue]);

  const byNature = useMemo(() => allocationByNature(holds), [holds]);
  const byCategory = useMemo(() => allocationByCategory(holds), [holds]);
  const rate = investmentRate; // 0-1, ya calculado en la página vía BaseIndicators
  const monthlyIncome = useMemo(() => monthlyIncomeOf(holds), [holds]);

  return (
    <>
      {/* Filtro A · indicadores */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="card-title">Indicadores</div>
        <PeriodSeg value={periodA} onChange={setPeriodA} label="Periodo de indicadores" />
      </div>

      <section className="cols-4">
        <KpiBox
          label="Tasa de inversión"
          value={formatPercent(rate)}
          hint="Aporte mensual recurrente ÷ ingreso mensual (de tu Base Financiera)."
          tone="info"
        />
        <KpiBox
          label="Rendimiento del periodo"
          value={`${retA.abs >= 0 ? "+" : ""}${formatMoney(retA.abs, currency)}`}
          sub={`${formatPercent(retA.pct)} en ${periodA}`}
          hint="Cambio de valor del portafolio en el periodo elegido. (Aún no descuenta aportes del periodo.)"
          tone={retA.abs >= 0 ? "pos" : "neg"}
        />
        <KpiBox
          label="Rentabilidad acumulada"
          value={`${analytics.totalProfitLoss >= 0 ? "+" : ""}${formatMoney(analytics.totalProfitLoss, currency)}`}
          sub={`${formatPercent(analytics.totalReturnPct)} desde el inicio`}
          hint="Ganancia/pérdida total sobre el costo base, desde que registras las posiciones."
          tone={analytics.totalProfitLoss >= 0 ? "pos" : "neg"}
        />
        <KpiBox
          label="Valor del portafolio"
          value={formatMoney(analytics.totalPortfolioValue, currency)}
          sub={`coste ${formatCompact(analytics.totalCostBasis, currency)}`}
          tone="neutral"
        />
      </section>

      {/* Línea: monto invertido en el tiempo */}
      <div className="card card-pad">
        <div className="card-title">Monto invertido en el tiempo</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Evolución del valor invertido · periodo {periodA}
        </div>
        <PerformanceChart data={investedSeries} currency={currency} height={200} tone="pos" />
      </div>

      {/* Dos donas: naturaleza y categoría */}
      <section className="cols-2">
        <AllocationDonut
          title="Por naturaleza"
          hint="Flujo de caja (genera ingreso) vs Crecimiento (plusvalía)."
          slices={byNature}
          total={analytics.totalPortfolioValue}
          currency={currency}
        />
        <AllocationDonut
          title="Por categoría"
          hint="Distribución entre las 20 categorías de la taxonomía."
          slices={byCategory}
          total={analytics.totalPortfolioValue}
          currency={currency}
        />
      </section>

      {/* Tabla · filtro B independiente + resumen de rendimiento del periodo */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Posiciones</div>
            <div className="card-sub">{holds.length} posición(es)</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PeriodSeg value={periodB} onChange={setPeriodB} label="Periodo de la tabla" />
            <AddHoldingButton currency={currency} />
          </div>
        </div>

        <div
          className="row"
          style={{ justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}
        >
          <span className="muted">
            Rendimiento del periodo ({periodB}){" "}
            <Tip text="Resumen del portafolio en el periodo elegido. El rend. acumulado por fila es desde el inicio (los snapshots son del portafolio, no por posición)." />
          </span>
          <span style={{ fontWeight: 600, color: retB.abs >= 0 ? "var(--pos)" : "var(--neg)" }}>
            {retB.abs >= 0 ? "+" : ""}
            {formatMoney(retB.abs, currency)} · {formatPercent(retB.pct)}
          </span>
        </div>

        {holds.length === 0 ? (
          <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
            Aún no registras posiciones.
          </div>
        ) : (
          holds.map((h) => (
            <HoldingTableRow key={h.id} h={h} currency={currency} monthlyIncome={monthlyIncome.get(h.id) ?? null} />
          ))
        )}
      </div>

      {/* Dividendos (preservado de la vista anterior) */}
      <DividendosSection currency={currency} div={dividendAnalytics} holds={holds} dividends={dividends} />

      {/* Preparación + balance (preservado) */}
      <ReadinessBlock summary={summary} />
    </>
  );
}

/** Ingreso mensual estimado por holding cashflow (renta normalizada a mes). */
function monthlyIncomeOf(holds: HoldingPerformance[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of holds) {
    if (h.rentalIncome && h.rentalIncome > 0) {
      const months = FREQ_MONTHS[h.rentalFrequency ?? "mensual"] ?? 1;
      m.set(h.id, h.rentalIncome / months);
    }
  }
  return m;
}

// ── Filtro de periodo (seg) ────────────────────────────────────────

function PeriodSeg({
  value,
  onChange,
  label,
}: {
  value: Period;
  onChange: (p: Period) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={value === p ? "seg-btn on" : "seg-btn"}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ── KPI text-box ───────────────────────────────────────────────────

function KpiBox({
  label,
  value,
  sub,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: "pos" | "neg" | "info" | "neutral";
}) {
  const color =
    tone === "pos"
      ? "var(--pos)"
      : tone === "neg"
        ? "var(--neg)"
        : tone === "info"
          ? "var(--info)"
          : "var(--ink)";
  return (
    <div className="card card-pad">
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <span className="label" style={{ fontSize: 12, color: "var(--muted)" }}>
          {label}
        </span>
        {hint ? <Tip text={hint} /> : null}
      </div>
      <div className="num-xl" style={{ marginTop: 6, fontSize: 22, color }}>
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── Dona de asignación ─────────────────────────────────────────────

function AllocationDonut({
  title,
  hint,
  slices,
  total,
  currency,
}: {
  title: string;
  hint: string;
  slices: AllocationSlice[];
  total: number;
  currency: string;
}) {
  const data: DonutDatum[] = slices
    .filter((s) => s.value > 0)
    .map((s) => ({ name: s.label, value: Math.round(s.value), color: s.color }));
  return (
    <div className="card card-pad">
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <div className="card-title">{title}</div>
        <Tip text={hint} />
      </div>
      <div className="alloc-mini" style={{ marginTop: 12 }}>
        <DonutChart data={data} centerLabel={formatCompact(total, currency)} centerSub="invertido" />
        <div style={{ flex: 1, minWidth: 150 }}>
          {data.length === 0 ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Agrega posiciones para ver su distribución.
            </span>
          ) : (
            slices
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.label} className="al-row">
                  <span className="sw" style={{ background: s.color }} />
                  <span className="nm">{s.label}</span>
                  <span className="pc">{formatPercent(s.pct)}</span>
                  <span className="am">{formatMoney(s.value, currency)}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fila de la tabla (abre el detalle con retiro/editar/eliminar) ──

function HoldingTableRow({
  h,
  currency,
  monthlyIncome,
}: {
  h: HoldingPerformance;
  currency: string;
  monthlyIncome: number | null;
}) {
  const [open, setOpen] = useState(false);
  const pos = h.returnPct >= 0;
  const isCashflow =
    h.nature === "cashflow" || (h.category ? CATEGORY_META[h.category]?.nature === "cashflow" : false);
  const catLabel = h.category ? CATEGORY_META[h.category]?.label : null;
  const natureLabel = isCashflow ? "Flujo de caja" : "Crecimiento";

  return (
    <>
      {open ? (
        <HoldingDetailModal
          holding={h}
          currentPrice={h.currentPrice ?? null}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <div className="hold-row" style={{ gridTemplateColumns: "38px 1.5fr 1fr 1fr 1fr 36px", alignItems: "center" }}>
        <HoldingIcon assetType={h.assetType} symbol={h.symbol} label={h.label} />
        <div style={{ minWidth: 0 }}>
          <div className="hold-name">{h.label ?? h.symbol}</div>
          <div className="hold-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {natureLabel}
            {catLabel ? ` · ${catLabel}` : ""}
          </div>
        </div>
        <div className="hold-val">
          <div className="v">{formatMoney(h.costBasis, currency)}</div>
          <div className="d muted">{h.isRecurring ? "aporte recurrente" : "invertido"}</div>
        </div>
        <div className="hold-val">
          <div className="v" style={{ color: pos ? "var(--pos)" : "var(--neg)" }}>
            {pos ? "+" : ""}
            {formatPercent(h.returnPct)}
          </div>
          <div className="d muted">
            {pos ? "+" : ""}
            {formatMoney(h.profitLoss, currency)}
          </div>
        </div>
        <div className="hold-val">
          {isCashflow ? (
            monthlyIncome != null ? (
              <>
                <div className="v" style={{ color: "var(--pos)" }}>
                  {formatMoney(monthlyIncome, currency)}
                </div>
                <div className="d muted">/mes</div>
              </>
            ) : h.incomeMonth ? (
              <>
                <div className="v">{MONTH_ABBR[h.incomeMonth - 1] ?? "—"}</div>
                <div className="d muted">materializa</div>
              </>
            ) : (
              <div className="d muted">—</div>
            )
          ) : (
            <div className="d muted">—</div>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Acciones de ${h.label ?? h.symbol}`}
          title="Retiro · editar · eliminar"
          style={{ width: 30, height: 30 }}
          onClick={() => setOpen(true)}
        >
          <Icon name="dots" />
        </button>
      </div>
    </>
  );
}

// ── Tip "?" ────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  return (
    <span
      className="tip"
      data-tip={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 15,
        height: 15,
        borderRadius: "50%",
        border: "1px solid var(--line)",
        color: "var(--muted)",
        fontSize: 10,
        fontWeight: 700,
        flex: "none",
      }}
    >
      ?
    </span>
  );
}

// ── Dividendos (preservado de la vista anterior) ───────────────────

const MONTHS_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function DividendosSection({
  currency,
  div,
  holds,
  dividends,
}: {
  currency: string;
  div: PortfolioReport["dividendAnalytics"];
  holds: HoldingPerformance[];
  dividends: Dividend[];
}) {
  const paid = dividends.filter((d) => d.amount > 0 || (d.yieldPct ?? 0) > 0);
  const holdById = new Map(holds.map((h) => [h.id, h]));

  const payers = useMemo(() => {
    const byHolding = new Map<string, { latest: Dividend; annual: number }>();
    for (const d of paid) {
      if (byHolding.has(d.holdingId)) continue;
      const factor = 12 / (FREQ_MONTHS[d.frequency ?? "anual"] ?? 12);
      byHolding.set(d.holdingId, { latest: d, annual: d.amount * factor });
    }
    return [...byHolding.entries()]
      .map(([holdingId, v]) => ({ holdingId, ...v }))
      .sort((a, b) => b.annual - a.annual);
  }, [paid]);

  if (paid.length === 0) {
    return (
      <div className="card card-pad" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        <div className="card-title">Dividendos</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Aún no registras dividendos · marca el dividendo de una inversión para verlos aquí.
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="stat-strip">
        <div className="card stat">
          <div className="ttl">Dividendos anuales</div>
          <div className="val">{formatMoney(div.annualDividends, currency)}</div>
        </div>
        <div className="card stat">
          <div className="ttl">Mensual estimado</div>
          <div className="val" style={{ color: "var(--pos)" }}>
            {formatMoney(div.monthlyDividends, currency)}
          </div>
        </div>
        <div className="card stat">
          <div className="ttl">Rentabilidad media</div>
          <div className="val">{formatPercent(div.dividendYield)}</div>
        </div>
        <div className="card stat">
          <div className="ttl">Yield on cost</div>
          <div className="val">{formatPercent(div.yieldOnCost)}</div>
        </div>
      </section>

      <section className="mid-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Calendario de dividendos</div>
              <div className="card-sub">Pagos registrados</div>
            </div>
          </div>
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
                  <div className="hold-sub" style={{ textTransform: "capitalize" }}>
                    {d.frequency ?? "pago"}
                  </div>
                </div>
                <div className="hold-val">
                  <div className="v" style={{ color: "var(--pos)" }}>
                    +{formatMoney(d.amount, d.currency)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Principales pagadores</div>
              <div className="card-sub">{payers.length} con dividendo · por $/año</div>
            </div>
          </div>
          {payers.map((p) => {
            const h = holdById.get(p.holdingId);
            return (
              <div key={p.holdingId} className="hold-row" style={{ gridTemplateColumns: "38px 1fr auto" }}>
                {h ? (
                  <HoldingIcon assetType={h.assetType} symbol={h.symbol} label={h.label} />
                ) : (
                  <div className="hold-ic" style={{ background: "var(--chip)", color: "var(--ink-2)" }}>
                    —
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="hold-name">{h?.label ?? h?.symbol ?? "Dividendo"}</div>
                  <div className="hold-sub">
                    {p.latest.yieldPct != null ? `${formatPercent(p.latest.yieldPct / 100)} rentab.` : (h?.symbol ?? "")}
                  </div>
                </div>
                <div className="hold-val">
                  <div className="v" style={{ color: "var(--pos)" }}>
                    {formatMoney(p.annual, p.latest.currency)}
                  </div>
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

// ── Preparación + balance (preservado) ─────────────────────────────

function ReadinessBlock({ summary }: { summary: WealthSummary }) {
  const { readiness, balance } = summary;
  const ring =
    readiness.semaforo === "verde"
      ? "var(--pos)"
      : readiness.semaforo === "rojo"
        ? "var(--neg)"
        : "var(--warn)";
  return (
    <section className="perf-grid">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="card-title">Tu próxima mejor acción</div>
          <span
            className="chip"
            style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}
          >
            Ascend AI
          </span>
        </div>
        <span className="chip" style={{ background: `color-mix(in srgb, ${ring} 16%, transparent)`, color: ring }}>
          ● {readiness.stateLabel}
        </span>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 10 }}>
          {readiness.message}
        </p>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
          {readiness.checklist.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 12.5 }}>
              <span style={{ color: c.met ? "var(--pos)" : "var(--muted-2)", flex: "none" }}>
                <Icon name={c.met ? "check" : "x"} width={2.4} />
              </span>
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
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
          {balance.message}
        </p>
      </div>
    </section>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
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
